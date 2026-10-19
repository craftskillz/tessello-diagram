<script lang="ts">
  // The title of the open diagram, the tools, and whether the last change is saved. There is no Save button: each
  // change is saved when its gesture ends.
  import { t } from "../lib/i18n.ts";
  import { diagrams, rename, status, type Tool, ui } from "../lib/store.svelte.ts";

  const TOOLS: { tool: Tool; label: () => string; icon: string }[] = [
    { tool: "select", label: () => t("tool_select"), icon: "M5 3l14 8-6 2-3 6z" },
    { tool: "rect", label: () => t("tool_rect"), icon: "M4 6h16v12H4z" },
    { tool: "arrow", label: () => t("tool_arrow"), icon: "M4 20L19 5M11 5h8v8" },
  ];

  function onTitleKey(event: KeyboardEvent) {
    if (event.key === "Enter") (event.currentTarget as HTMLInputElement).blur();
    if (event.key === "Escape") {
      (event.currentTarget as HTMLInputElement).value = diagrams.open?.title ?? "";
      (event.currentTarget as HTMLInputElement).blur();
    }
  }
</script>

<header class="dg-toolbar">
  <input
    class="dg-title"
    aria-label={t("title_label")}
    value={diagrams.open?.title ?? ""}
    onchange={(event) => {
      void rename(event.currentTarget.value);
      event.currentTarget.value = diagrams.open?.title ?? "";
    }}
    onkeydown={onTitleKey}
  />
  <div class="dg-tools" role="group" aria-label={t("tools")}>
    {#each TOOLS as { tool, label, icon } (tool)}
      <button type="button" class="dg-btn dg-tool" aria-pressed={ui.tool === tool} title={label()} onclick={() => (ui.tool = tool)}>
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d={icon} /></svg>
        <span>{label()}</span>
      </button>
    {/each}
  </div>
  <p class="dg-save" class:failed={status.saveError} role="status">
    {status.saveError ? t("save_failed") : status.saving ? t("saving") : t("saved")}
  </p>
</header>

<style>
  .dg-toolbar {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 8px 12px;
    border-bottom: 1px solid var(--line);
    background: var(--panel);
    flex-wrap: wrap;
  }
  .dg-title {
    flex: 1 1 160px;
    min-width: 0;
    max-width: 320px;
    padding: 6px 8px;
    font: inherit;
    font-weight: 600;
    border: 1px solid transparent;
    border-radius: 8px;
    background: transparent;
    color: var(--ink);
  }
  .dg-title:hover,
  .dg-title:focus {
    border-color: var(--line);
    background: var(--bg);
    outline: none;
  }
  .dg-tools {
    display: flex;
    gap: 4px;
  }
  .dg-tool {
    display: inline-flex;
    align-items: center;
    gap: 6px;
  }
  .dg-tool svg {
    width: 16px;
    height: 16px;
    fill: none;
    stroke: currentColor;
    stroke-width: 2;
    stroke-linejoin: round;
    stroke-linecap: round;
  }
  .dg-save {
    margin: 0 0 0 auto;
    font-size: 12px;
    color: var(--muted);
  }
  .dg-save.failed {
    color: var(--red);
    font-weight: 600;
  }
  @media (max-width: 720px) {
    .dg-tool span {
      display: none;
    }
  }
</style>
