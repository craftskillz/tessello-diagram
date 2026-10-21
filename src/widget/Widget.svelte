<script lang="ts">
  import type { ConnectedModule } from "@tessello/sdk";
  import { onMount } from "svelte";
  import type { DiagramEntry } from "../lib/diagram.ts";
  import { t, titleOf } from "../lib/i18n.ts";
  import { recentDiagrams, relativeTime } from "../lib/recent.ts";
  import { diagramStorage } from "../lib/storage.ts";

  let { host }: { host: ConnectedModule } = $props();

  const storage = $derived(diagramStorage(host.storage));

  let recent = $state<DiagramEntry[]>([]);
  /** When the diagrams were read, which the times shown are relative to. */
  let now = $state(Date.now());
  let loaded = $state(false);
  let error = $state("");

  async function refresh() {
    try {
      recent = recentDiagrams(await storage.readIndex());
      now = Date.now();
      loaded = true;
      error = "";
    } catch {
      error = t("widget_error");
    }
  }

  onMount(() => {
    void refresh();
    // The View may have changed the diagrams while the Widget was hidden behind it.
    return host.onVisibilityChange((visible) => visible && void refresh());
  });
</script>

<div class="widget">
  <header>
    <h1>{t("sidebar_title")}</h1>
    <button type="button" class="pill" onclick={() => host.openView({ new: "true" })}>{t("sidebar_new")}</button>
    <button type="button" class="pill" onclick={() => host.openView()}>{t("widget_open")} ↗</button>
  </header>

  {#if error}
    <p class="error" role="alert">{error}</p>
  {/if}

  {#if loaded}
    <ul aria-label={t("widget_recent")}>
      {#each recent as entry (entry.id)}
        <li>
          <button type="button" onclick={() => host.openView({ id: entry.id })}>
            <span class="name">{titleOf(entry.title)}</span>
            <!-- A diagram stored without a date of change shows none. -->
            {#if entry.updatedAt > 0}
              <span class="when">{relativeTime(entry.updatedAt, now)}</span>
            {/if}
          </button>
        </li>
      {:else}
        <li class="none">{t("widget_empty")}</li>
      {/each}
    </ul>
  {/if}
</div>

<style>
  /* The Widget fills its cell and never scrolls (CONVENTION.md §7.1): what does not fit is cut off. */
  .widget {
    display: flex;
    flex-direction: column;
    gap: 6px;
    height: 100vh;
    padding: 10px 14px;
    overflow: hidden;
    font-size: 12px;
  }
  header {
    display: flex;
    align-items: center;
    gap: 6px;
  }
  h1 {
    flex: 1;
    margin: 0;
    font-size: 14px;
    font-weight: 700;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  button {
    font: inherit;
    color: inherit;
    cursor: pointer;
  }
  .pill {
    border: 1px solid var(--line);
    border-radius: 999px;
    padding: 2px 10px;
    background: var(--panel-soft);
    color: var(--accent-strong);
    font-size: 11px;
    white-space: nowrap;
  }
  .pill:hover {
    border-color: var(--accent);
  }
  .error {
    margin: 0;
    color: var(--red);
  }
  ul {
    flex: 1;
    min-height: 0;
    display: flex;
    flex-direction: column;
    gap: 2px;
    margin: 0;
    padding: 0;
    list-style: none;
    overflow: hidden;
  }
  li button {
    display: flex;
    align-items: baseline;
    gap: 8px;
    width: 100%;
    padding: 3px 6px;
    border: 0;
    border-radius: 6px;
    background: none;
    text-align: left;
  }
  li button:hover {
    background: var(--accent-soft);
  }
  .name {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .when {
    color: var(--muted);
    font-size: 11px;
    white-space: nowrap;
  }
  .none {
    color: var(--muted);
    font-style: italic;
  }
</style>
