<script lang="ts">
  // The title of the open diagram, the tools, and whether the last change is saved. There is no Save button: each
  // change is saved when its gesture ends.
  import { t } from "../lib/i18n.ts";
  import { diagrams, rename, save, type Tool, ui } from "../lib/store.svelte.ts";
  import DefaultsDialog from "./DefaultsDialog.svelte";
  import { exportDrawio, exportPng } from "./exports.ts";
  import SaveStatus from "./SaveStatus.svelte";

  const TOOLS: { tool: Tool; label: () => string; icon: string }[] = [
    { tool: "select", label: () => t("tool_select"), icon: "M5 3l14 8-6 2-3 6z" },
    { tool: "rect", label: () => t("tool_rect"), icon: "M4 6h16v12H4z" },
    { tool: "ellipse", label: () => t("tool_ellipse"), icon: "M3 12a9 6 0 1 0 18 0a9 6 0 1 0-18 0" },
    { tool: "database", label: () => t("tool_database"), icon: "M5 6a7 3 0 1 0 14 0a7 3 0 1 0-14 0M5 6v12a7 3 0 0 0 14 0V6" },
    { tool: "circle", label: () => t("tool_circle"), icon: "M4 12a8 8 0 1 0 16 0a8 8 0 1 0-16 0" },
    { tool: "actor", label: () => t("tool_actor"), icon: "M9 5a3 3 0 1 0 6 0a3 3 0 1 0-6 0M12 8v7M6 11h12M12 15l-4 6M12 15l4 6" },
    { tool: "postit", label: () => t("tool_postit"), icon: "M4 4h11l5 5v11H4zM15 4v5h5" },
    { tool: "text", label: () => t("tool_text"), icon: "M5 6h14M12 6v13M9 19h6" },
    { tool: "arrow", label: () => t("tool_arrow"), icon: "M4 20L19 5M11 5h8v8" },
    { tool: "image", label: () => t("tool_image"), icon: "M4 5h16v14H4zM4 16l5-5 4 4 2-2 5 5M15 9.5a1.5 1.5 0 1 0 0.01 0" },
  ];

  /** Whether "Diagram defaults" is open. */
  let editingDefaults = $state(false);

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
      <button type="button" class="dg-btn dg-tool" aria-pressed={ui.tool === tool} aria-label={label()} title={label()} onclick={() => (ui.tool = tool)}>
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d={icon} /></svg>
      </button>
    {/each}
  </div>
  <button
    type="button"
    class="dg-btn"
    title={ui.resizeFromCenter ? t("resize_center_hint") : t("resize_corner_hint")}
    onclick={() => (ui.resizeFromCenter = !ui.resizeFromCenter)}
  >
    {ui.resizeFromCenter ? t("resize_center") : t("resize_corner")}
  </button>
  {#if diagrams.open}
    {@const diagram = diagrams.open}
    <div class="dg-tools">
      <button type="button" class="dg-btn" aria-pressed={diagram.grid} title={t("grid_hint")} onclick={() => ((diagram.grid = !diagram.grid), void save())}>{t("grid")}</button>
      <button type="button" class="dg-btn" aria-pressed={diagram.guides} title={t("guides_hint")} onclick={() => ((diagram.guides = !diagram.guides), void save())}>{t("guides")}</button>
    </div>
  {/if}
  <button type="button" class="dg-btn" title={t("defaults_open_hint")} onclick={() => (editingDefaults = true)}>{t("defaults_open")}</button>
  {#if editingDefaults}
    <DefaultsDialog onClose={() => (editingDefaults = false)} />
  {/if}
  <button type="button" class="dg-btn" title={t("shapes_open_hint")} onclick={() => (ui.screen = "shapes")}>{t("shapes_open")}</button>
  <div class="dg-tools">
    <button type="button" class="dg-btn" title={t("export_png_hint")} onclick={exportPng}>{t("export_png")}</button>
    <button type="button" class="dg-btn" aria-pressed={ui.transparentPng} title={t("export_transparent_hint")} onclick={() => (ui.transparentPng = !ui.transparentPng)}>
      {t("export_transparent")}
    </button>
    <button type="button" class="dg-btn" title={t("export_drawio_hint")} onclick={exportDrawio}>{t("export_drawio")}</button>
  </div>
  <SaveStatus />
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
    padding: 5px 7px;
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
</style>
