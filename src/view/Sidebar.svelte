<script lang="ts">
  // The list of diagrams: open one, create one, or delete one after a confirmation.
  import { ask } from "../lib/confirmation.svelte.ts";
  import type { DiagramEntry } from "../lib/diagram.ts";
  import { t, titleOf } from "../lib/i18n.ts";
  import { create, diagrams, open, remove } from "../lib/store.svelte.ts";

  async function confirmRemove(entry: DiagramEntry) {
    if (await ask(t("confirm_delete_title"), t("confirm_delete_msg", { title: titleOf(entry.title) }))) await remove(entry.id);
  }
</script>

<nav class="dg-sidebar" aria-label={t("sidebar_title")}>
  <div class="dg-sidebar-head">
    <h2>{t("sidebar_title")}</h2>
    <button type="button" class="dg-btn" onclick={create}>{t("sidebar_new")}</button>
  </div>
  {#if diagrams.list.length === 0}
    <p class="dg-sidebar-empty">{t("sidebar_empty")}</p>
  {:else}
    <ul>
      {#each diagrams.list as entry (entry.id)}
        <li class:active={entry.id === diagrams.open?.id}>
          <button type="button" class="dg-open" aria-current={entry.id === diagrams.open?.id ? "page" : undefined} onclick={() => open(entry.id)}>
            {titleOf(entry.title)}
          </button>
          <button type="button" class="dg-delete" aria-label={t("delete_diagram", { title: titleOf(entry.title) })} title={t("delete")} onclick={() => confirmRemove(entry)}>
            ×
          </button>
        </li>
      {/each}
    </ul>
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
  @media (max-width: 600px) {
    .dg-sidebar {
      width: 150px;
    }
  }
</style>
