<script lang="ts">
  import { t } from "../lib/i18n.ts";
  import { diagrams, load, status } from "../lib/store.svelte.ts";
  import Canvas from "./Canvas.svelte";
  import ConfirmDialog from "./ConfirmDialog.svelte";
  import Sidebar from "./Sidebar.svelte";
  import Toolbar from "./Toolbar.svelte";
</script>

<div class="dg-root">
  {#if status.loadError}
    <div class="dg-blocked" role="alert">
      <p>{status.loadError}</p>
      <button type="button" class="dg-btn" onclick={load}>{t("load_retry")}</button>
    </div>
  {:else if !status.loaded}
    <p class="dg-message">{t("loading")}</p>
  {:else}
    <Sidebar />
    <main class="dg-main">
      {#if status.saveError}
        <p class="dg-banner" role="alert">{status.saveError}</p>
      {/if}
      {#if diagrams.open}
        <Toolbar />
        <Canvas diagram={diagrams.open} />
      {:else}
        <p class="dg-message">{t("empty_state")}</p>
      {/if}
    </main>
  {/if}
</div>

<ConfirmDialog />

<style>
  .dg-root {
    display: flex;
    height: 100%;
  }
  .dg-main {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
  }
  .dg-message {
    margin: auto;
    color: var(--muted);
    font-size: 14px;
  }
  .dg-banner,
  .dg-blocked {
    margin: 0;
    padding: 10px 14px;
    border: 1px solid var(--red);
    background: var(--red-soft);
    font-size: 13px;
  }
  .dg-blocked {
    margin: 24px;
    border-radius: 10px;
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 10px;
    height: fit-content;
  }
  .dg-blocked p {
    margin: 0;
  }
</style>
