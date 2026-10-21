<script lang="ts">
  // The selected arrows: their heads, solid or dashed line, width and color; their route, straight, curved or elbow,
  // "Reset route", which removes their waypoints, and "Detach ends", which makes their ends attached to a port automatic;
  // and their label, its size, its rotation, and "Reset label", which brings it back to the middle of the line at its
  // automatic width. A control applies to every selected arrow. The panel is docked beside the canvas, as the panel of
  // the shapes.
  import { ARROW_WIDTHS, type Arrow, clampArrowWidth, clampFontSize, COLORS, detachEnds, FONT_SIZES, HEADS, ROUTES } from "../lib/diagram.ts";
  import { degrees, isAttached } from "../lib/geometry.ts";
  import { t } from "../lib/i18n.ts";
  import { save } from "../lib/store.svelte.ts";

  let { arrows, onEditLabel }: { arrows: Arrow[]; onEditLabel: (id: string) => void } = $props();

  const onPorts = $derived(arrows.some((arrow) => [arrow.from, arrow.to].some((end) => isAttached(end) && end.port)));
  const withWaypoints = $derived(arrows.some((arrow) => arrow.waypoints.length));
  const withLabel = $derived(arrows.some((arrow) => arrow.label));
  /** The value the selected arrows share, if they share one. */
  const shared = <K extends keyof Arrow>(key: K): Arrow[K] | undefined => (arrows.every((arrow) => arrow[key] === arrows[0]?.[key]) ? arrows[0]?.[key] : undefined);

  function apply(change: (arrow: Arrow) => void) {
    arrows.forEach(change);
    void save();
  }

  /** The heads, as a line with a head at its start, its end, both or neither. */
  const HEAD_ICONS: Record<(typeof HEADS)[number], string> = {
    none: "M4 12h16",
    start: "M4 12h16M9 7l-5 5 5 5",
    end: "M4 12h16M15 7l5 5-5 5",
    both: "M4 12h16M9 7l-5 5 5 5M15 7l5 5-5 5",
  };
</script>

<aside class="dg-panel" aria-label={t("arrow_panel")}>
  <div class="dg-group" role="group" aria-label={t("heads")}>
    {#each HEADS as value (value)}
      <button type="button" class="dg-btn dg-icon" aria-label={t(`heads_${value}`)} title={t(`heads_${value}`)} aria-pressed={shared("heads") === value} onclick={() => apply((arrow) => (arrow.heads = value))}>
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d={HEAD_ICONS[value]} /></svg>
      </button>
    {/each}
  </div>

  <div class="dg-group" role="group" aria-label={t("line_style")}>
    <button type="button" class="dg-btn" aria-pressed={shared("dashed") === false} onclick={() => apply((arrow) => (arrow.dashed = false))}>{t("line_solid")}</button>
    <button type="button" class="dg-btn" aria-pressed={shared("dashed") === true} onclick={() => apply((arrow) => (arrow.dashed = true))}>{t("line_dashed")}</button>
  </div>

  <label class="dg-field">
    <span>{t("line_width")}</span>
    <input
      type="number"
      min={ARROW_WIDTHS.min}
      max={ARROW_WIDTHS.max}
      step={ARROW_WIDTHS.step}
      value={shared("width") ?? ""}
      onchange={(event) => {
        const value = event.currentTarget.valueAsNumber;
        if (Number.isFinite(value)) apply((arrow) => (arrow.width = clampArrowWidth(value)));
        event.currentTarget.value = String(shared("width") ?? "");
      }}
    />
  </label>

  <div class="dg-swatches" role="group" aria-label={t("color")}>
    {#each COLORS as color (color)}
      <button
        type="button"
        class="dg-swatch dg-line-swatch {color}"
        aria-label={t(color)}
        title={t(color)}
        aria-pressed={shared("color") === color}
        onclick={() => apply((arrow) => (arrow.color = color))}
      ></button>
    {/each}
  </div>

  <div class="dg-group" role="group" aria-label={t("route")}>
    {#each ROUTES as value (value)}
      <button type="button" class="dg-btn" aria-pressed={shared("route") === value} onclick={() => apply((arrow) => (arrow.route = value))}>{t(`route_${value}`)}</button>
    {/each}
  </div>
  <button type="button" class="dg-btn" disabled={!withWaypoints} title={t("reset_route_hint")} onclick={() => apply((arrow) => (arrow.waypoints = []))}>{t("reset_route")}</button>
  <button type="button" class="dg-btn" disabled={!onPorts} title={t("detach_ends_hint")} onclick={() => apply(detachEnds)}>{t("detach_ends")}</button>

  {#if arrows.length === 1}
    <button type="button" class="dg-btn" onclick={() => onEditLabel(arrows[0].id)}>{t("edit_label")}</button>
  {/if}
  <label class="dg-field">
    <span>{t("label_size")}</span>
    <input
      type="number"
      min={FONT_SIZES.min}
      max={FONT_SIZES.max}
      value={shared("labelSize") ?? ""}
      onchange={(event) => {
        const value = event.currentTarget.valueAsNumber;
        if (Number.isFinite(value)) apply((arrow) => (arrow.labelSize = clampFontSize(value)));
        event.currentTarget.value = String(shared("labelSize") ?? "");
      }}
    />
  </label>
  <div class="dg-row">
    <span class="dg-label">{t("label_rotation")}</span>
    <button type="button" class="dg-btn" aria-label={t("rotate_label_left")} title={t("rotate_label_left")} onclick={() => apply((arrow) => (arrow.labelRotation = degrees(arrow.labelRotation - 15)))}>↺ 15°</button>
    <button type="button" class="dg-btn" aria-label={t("rotate_label_right")} title={t("rotate_label_right")} onclick={() => apply((arrow) => (arrow.labelRotation = degrees(arrow.labelRotation + 15)))}>↻ 15°</button>
  </div>
  <button
    type="button"
    class="dg-btn"
    disabled={!withLabel}
    title={t("reset_label_hint")}
    onclick={() => apply((arrow) => Object.assign(arrow, { labelAt: 0.5, labelOffset: 0, labelWidth: null }))}>{t("reset_label")}</button
  >
</aside>

<style>
  /* A swatch of a line shows the color of its outline. */
  .dg-line-swatch {
    background: var(--stroke);
  }
</style>
