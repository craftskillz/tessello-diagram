<script lang="ts">
  // The list of diagrams: open one, which forgets the links followed, create one, import files of living-documentation, or
  // delete one after a confirmation.
  // Below it, how much of the storage the Module uses, which alerts past `ALERT` of it.
  import { ask } from "../lib/confirmation.svelte.ts";
  import type { DiagramEntry } from "../lib/diagram.ts";
  import { t, titleOf } from "../lib/i18n.ts";
  import { create, diagrams, importFiles, openFromList, remove, status } from "../lib/store.svelte.ts";
  import { ALERT, QUOTA, usageText } from "../lib/usage.ts";

  let chooser: HTMLInputElement;

  async function chosen() {
    const files = [...(chooser.files ?? [])];
    // Chosen again later, the same files must raise the event again.
    chooser.value = "";
    if (files.length) await importFiles(files);
  }

  async function confirmRemove(entry: DiagramEntry) {
    if (await ask(t("confirm_delete_title"), t("confirm_delete_msg", { title: titleOf(entry.title) }))) await remove(entry.id);
  }
</script>

<nav class="dg-sidebar" aria-label={t("sidebar_title")}>
  <div class="dg-sidebar-head">
    <h2>{t("sidebar_title")}</h2>
    <div class="dg-actions">
      <button type="button" class="dg-btn" title={t("sidebar_import_hint")} onclick={() => chooser.click()}>{t("sidebar_import")}</button>
      <button type="button" class="dg-btn" onclick={create}>{t("sidebar_new")}</button>
    </div>
    <input bind:this={chooser} type="file" multiple accept=".json,application/json,image/*" hidden onchange={chosen} />
  </div>
  {#if diagrams.list.length === 0}
    <p class="dg-sidebar-empty">{t("sidebar_empty")}</p>
  {:else}
    <ul>
      {#each diagrams.list as entry (entry.id)}
        <li class:active={entry.id === diagrams.open?.id}>
          <button type="button" class="dg-open" aria-current={entry.id === diagrams.open?.id ? "page" : undefined} onclick={() => openFromList(entry.id)}>
            {titleOf(entry.title)}
          </button>
          <button type="button" class="dg-delete" aria-label={t("delete_diagram", { title: titleOf(entry.title) })} title={t("delete")} onclick={() => confirmRemove(entry)}>
            ×
          </button>
        </li>
      {/each}
    </ul>
  {/if}
  {#if status.usage !== null}
    {@const gauge = usageText(status.usage)}
    <div class="dg-usage" class:alert={gauge.alert} title={gauge.alert ? t("storage_usage_alert") : t("storage_usage_hint")}>
      <p>{t("storage_usage", { usage: gauge.text })}</p>
      <meter min="0" max={QUOTA} high={QUOTA * ALERT} optimum="0" value={status.usage} aria-label={t("storage_usage", { usage: gauge.text })}></meter>
      {#if gauge.alert}
        <p role="alert">{t("storage_usage_alert")}</p>
      {/if}
    </div>
  {/if}
</nav>

<style>
  .dg-sidebar {
    width: 220px;
    flex-shrink: 0;
    display: flex;
    flex-direction: column;
    border-right: 1px solid var(--line);
    background: var(--panel);
    overflow-y: auto;
  }
  .dg-sidebar-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 12px;
  }
  .dg-actions {
    display: flex;
    gap: 6px;
  }
  h2 {
    margin: 0;
    font-size: 12px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: var(--muted);
  }
  .dg-sidebar-empty {
    margin: 0;
    padding: 0 12px;
    font-size: 13px;
    font-style: italic;
    color: var(--muted);
  }
  ul {
    list-style: none;
    margin: 0;
    padding: 0 6px 12px;
  }
  li {
    display: flex;
    align-items: center;
    border-radius: 8px;
  }
  li:hover,
  li.active {
    background: var(--accent-soft);
  }
  .dg-open {
    flex: 1;
    min-width: 0;
    padding: 7px 8px;
    border: none;
    background: none;
    color: var(--ink);
    font: inherit;
    font-size: 13px;
    text-align: left;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    cursor: pointer;
  }
  li.active .dg-open {
    font-weight: 600;
    color: var(--accent-strong);
  }
  .dg-delete {
    width: 24px;
    height: 24px;
    margin-right: 4px;
    border: none;
    border-radius: 6px;
    background: none;
    color: var(--muted);
    font-size: 16px;
    cursor: pointer;
    opacity: 0;
  }
  li:hover .dg-delete,
  .dg-delete:focus-visible {
    opacity: 1;
  }
  .dg-delete:hover {
    color: var(--red);
    background: var(--red-soft);
  }
  .dg-usage {
    margin-top: auto;
    padding: 10px 12px;
    border-top: 1px solid var(--line);
    font-size: 12px;
    color: var(--muted);
  }
  .dg-usage p {
    margin: 0 0 4px;
  }
  .dg-usage meter {
    width: 100%;
  }
  .dg-usage.alert {
    color: var(--red);
    font-weight: 600;
  }
  @media (max-width: 600px) {
    .dg-sidebar {
      width: 150px;
    }
  }
</style>
