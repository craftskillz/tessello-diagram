<script lang="ts">
  // The style of the selected shapes: color, opacity of the fill, text size and alignments, rotation of the shape and
  // of its text, and order; their group, their lock, and the copy of a style; the link of a single shape. A control
  // applies to every selected shape, and a change is saved when it is made. On a table, the color, the text size, the
  // bold, italic and underline and the alignments style the selected cells when there are some, else the whole table,
  // which erases the own style of its cells. "Save as default for this shape type"
  // makes the style of one built-in shape the default of its type. The panel is docked beside the canvas, so that it never hides the drawing.
  import { isBuiltIn, shapeAsDefault } from "../lib/defaults.ts";
  import { type CellStyle, clampFontSize, COLORS, FONT_SIZES, groupShapes, LABEL_PLACEMENTS, type LabelPlacement, reorder, type Shape, ungroupShapes } from "../lib/diagram.ts";
  import { degrees } from "../lib/geometry.ts";
  import { type CellRange, MAX_CELLS, setColumnCount, setRowCount, sharedCellStyle, styleCells, styleTable, tableOf, wholeRange } from "../lib/table.ts";
  import { t } from "../lib/i18n.ts";
  import { creation, diagrams, save, saveDefaults, ui } from "../lib/store.svelte.ts";
  import LinkDialog from "./LinkDialog.svelte";
  import SelectionActions from "./SelectionActions.svelte";

  let {
    shapes,
    onEditText,
    onLock,
    onCopyStyle,
    onPasteStyle,
    cells,
  }: { cells?: CellRange; shapes: Shape[]; onEditText: (id: string) => void; onLock: () => void; onCopyStyle: () => void; onPasteStyle: () => void } = $props();

  /** Whether "Link on this shape" is open, for the one selected shape. */
  let linking = $state(false);

  /** The first selected shape: the panel shows its values where the selection does not share one. */
  const first = $derived(shapes[0]);

  /** The shape whose style was just saved as the default of its type, until another is selected. */
  let savedDefault = $state<string | null>(null);

  function saveAsDefault() {
    savedDefault = first.id;
    void saveDefaults(shapeAsDefault(creation.defaults, first));
  }

  /** The cells the style goes to: the selected cells of the one selected table, none for the whole shapes. */
  const cellRange = $derived(cells && shapes.length === 1 && first.type === "table" ? cells : undefined);

  /** The value of a style key that the selected cells, or else the selected shapes, share; for a table, the value of all its cells. */
  function styled<K extends keyof CellStyle>(key: K): CellStyle[K] | undefined {
    if (cellRange) return sharedCellStyle(first, cellRange, key);
    const values = shapes.map((shape) => (shape.type === "table" ? sharedCellStyle(shape, wholeRange(shape), key) : (shape[key] as CellStyle[K])));
    return values.every((value) => value === values[0]) ? values[0] : undefined;
  }

  /** Applies a style to the selected cells; without any, to every selected shape, a table being styled as a whole. */
  function style(change: CellStyle) {
    if (cellRange) {
      first.cellStyles = styleCells(first, cellRange, change);
      return void save();
    }
    apply((shape) => Object.assign(shape, shape.type === "table" ? styleTable(shape, change) : change));
  }

  /** The value the selected shapes share, if they share one. */
  const shared = <K extends keyof Shape>(key: K): Shape[K] | undefined => (shapes.every((shape) => shape[key] === first[key]) ? first[key] : undefined);

  function apply(change: (shape: Shape) => void) {
    shapes.forEach(change);
    void save();
  }

  function setFontSize(value: number) {
    if (Number.isFinite(value)) style({ fontSize: clampFontSize(value) });
  }

  function order(where: "front" | "back") {
    if (!diagrams.open) return;
    reorder(
      diagrams.open,
      shapes.map((shape) => shape.id),
      where,
    );
    void save();
  }

  function group() {
    if (diagrams.open && groupShapes(diagrams.open, shapes.map((shape) => shape.id))) void save();
  }

  function ungroup() {
    if (!diagrams.open) return;
    ungroupShapes(diagrams.open, shapes.map((shape) => shape.id));
    void save();
  }

  const EMPHASES = [
    { key: "bold", label: () => t("bold"), glyph: "B" },
    { key: "italic", label: () => t("italic"), glyph: "I" },
    { key: "underline", label: () => t("underline"), glyph: "U" },
  ] as const;
  const ALIGNS = [
    { value: "left", label: () => t("align_left"), icon: "M4 6h16M4 12h10M4 18h13" },
    { value: "center", label: () => t("align_center"), icon: "M4 6h16M7 12h10M5 18h14" },
    { value: "right", label: () => t("align_right"), icon: "M4 6h16M10 12h10M7 18h13" },
  ] as const;
  const VALIGNS = [
    { value: "top", label: () => t("valign_top"), icon: "M4 4h16M8 9h8M8 13h8" },
    { value: "middle", label: () => t("valign_middle"), icon: "M8 8h8M4 12h16M8 16h8" },
    { value: "bottom", label: () => t("valign_bottom"), icon: "M8 11h8M8 15h8M4 20h16" },
  ] as const;
</script>

<aside class="dg-panel" aria-label={t("shape_panel")}>
  <!-- Empty only while the panel slides out, the selection already gone. -->
  {#if first}
    <div class="dg-swatches" role="group" aria-label={t("color")}>
      {#each COLORS as color (color)}
        <button
          type="button"
          class="dg-swatch {color}"
          aria-label={t(color)}
          title={t(color)}
          aria-pressed={styled("color") === color}
          onclick={() => style({ color })}
        ></button>
      {/each}
    </div>

    <label class="dg-field">
      <span>{t("opacity")}</span>
      <input
        type="range"
        min="0"
        max="100"
        value={Math.round((shared("opacity") ?? first.opacity) * 100)}
        oninput={(event) => shapes.forEach((shape) => (shape.opacity = Number(event.currentTarget.value) / 100))}
        onchange={() => void save()}
      />
      <output>{Math.round((shared("opacity") ?? first.opacity) * 100)}%</output>
    </label>

    <label class="dg-field">
      <span>{t("font_size")}</span>
      <input
        type="number"
        min={FONT_SIZES.min}
        max={FONT_SIZES.max}
        value={styled("fontSize") ?? ""}
        onchange={(event) => {
          setFontSize(event.currentTarget.valueAsNumber);
          event.currentTarget.value = String(styled("fontSize") ?? "");
        }}
      />
    </label>

    {#if shapes.every((shape) => shape.type === "table")}
      <!-- Bold, italic and underline apply to the whole text of a cell. -->
      <div class="dg-group" role="group" aria-label={t("text_style")}>
        {#each EMPHASES as { key, label, glyph } (key)}
          <button type="button" class="dg-btn dg-icon dg-emphasis dg-emphasis-{key}" aria-label={label()} title={label()} aria-pressed={styled(key) === true} onclick={() => style({ [key]: styled(key) !== true })}>{glyph}</button>
        {/each}
      </div>
      {#if cellRange}
        <p class="dg-hint">{t("cells_style_hint")}</p>
      {/if}
    {/if}

    <div class="dg-row">
      <div class="dg-group" role="group" aria-label={t("text_align")}>
        {#each ALIGNS as { value, label, icon } (value)}
          <button type="button" class="dg-btn dg-icon" aria-label={label()} title={label()} aria-pressed={styled("textAlign") === value} onclick={() => style({ textAlign: value })}>
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d={icon} /></svg>
          </button>
        {/each}
      </div>
      <div class="dg-group" role="group" aria-label={t("text_valign")}>
        {#each VALIGNS as { value, label, icon } (value)}
          <button type="button" class="dg-btn dg-icon" aria-label={label()} title={label()} aria-pressed={styled("textValign") === value} onclick={() => style({ textValign: value })}>
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d={icon} /></svg>
          </button>
        {/each}
      </div>
    </div>

    {#if shapes.every((shape) => shape.type === "table")}
      <!-- The rows and columns of the tables: the value they share, or none when they differ. -->
      {#each [{ label: "table_rows", count: (shape: Shape) => tableOf(shape).cells.length, set: setRowCount }, { label: "table_columns", count: (shape: Shape) => tableOf(shape).cells[0].length, set: setColumnCount }] as { label, count, set } (label)}
        {@const value = shapes.every((shape) => count(shape) === count(first)) ? count(first) : ""}
        <label class="dg-field">
          <span>{t(label as "table_rows" | "table_columns")}</span>
          <input
            type="number"
            min="1"
            max={MAX_CELLS}
            {value}
            onchange={(event) => {
              const next = event.currentTarget.valueAsNumber;
              if (Number.isFinite(next)) apply((shape) => Object.assign(shape, set(shape, next)));
              event.currentTarget.value = String(shapes.every((shape) => count(shape) === count(first)) ? count(first) : "");
            }}
          />
        </label>
      {/each}
    {/if}

    {#if shapes.every((shape) => shape.type === "custom")}
      <!-- Where the text of a custom shape goes, taken from its definition, changed on these shapes only. -->
      <label class="dg-field">
        <span>{t("label_placement")}</span>
        <select value={shared("labelPlacement") ?? ""} onchange={(event) => apply((shape) => (shape.labelPlacement = event.currentTarget.value as LabelPlacement))}>
          {#each LABEL_PLACEMENTS as placement (placement)}
            <option value={placement}>{t(`placement_${placement}`)}</option>
          {/each}
        </select>
      </label>
    {/if}

    <div class="dg-row">
      <span class="dg-label">{t("rotation")}</span>
      <button type="button" class="dg-btn" aria-label={t("rotate_left")} title={t("rotate_left")} onclick={() => apply((shape) => (shape.rotation = degrees(shape.rotation - 10)))}>↺ 10°</button>
      <button type="button" class="dg-btn" aria-label={t("rotate_right")} title={t("rotate_right")} onclick={() => apply((shape) => (shape.rotation = degrees(shape.rotation + 10)))}>↻ 10°</button>
    </div>
    <!-- A table's text turns with the table only. -->
    {#if !shapes.every((shape) => shape.type === "table")}
      <div class="dg-row">
        <span class="dg-label">{t("text_rotation")}</span>
        <button type="button" class="dg-btn" aria-label={t("rotate_text_left")} title={t("rotate_text_left")} onclick={() => apply((shape) => (shape.textRotation = degrees(shape.textRotation - 10)))}>↺ 10°</button>
        <button type="button" class="dg-btn" aria-label={t("rotate_text_right")} title={t("rotate_text_right")} onclick={() => apply((shape) => (shape.textRotation = degrees(shape.textRotation + 10)))}>↻ 10°</button>
      </div>
    {/if}

    <div class="dg-row">
      <button type="button" class="dg-btn" onclick={() => order("front")}>{t("bring_to_front")}</button>
      <button type="button" class="dg-btn" onclick={() => order("back")}>{t("send_to_back")}</button>
    </div>

    {#if shapes.length === 1}
      <button type="button" class="dg-btn" onclick={() => onEditText(first.id)}>{t("edit_text")}</button>
      {#if isBuiltIn(first)}
        <button type="button" class="dg-btn" onclick={saveAsDefault}>{t("defaults_save_shape")}</button>
        {#if savedDefault === first.id}
          <p class="dg-hint" role="status">{t("defaults_saved_shape", { type: t(`type_${first.type}`) })}</p>
        {/if}
      {/if}
      <button type="button" class="dg-btn" title={t("link_open_hint")} onclick={() => (linking = true)}>{t("link_open")}</button>
      {#if linking}
        <LinkDialog shape={first} onClose={() => (linking = false)} />
      {/if}
    {/if}

    <div class="dg-row">
      <button type="button" class="dg-btn" disabled={shapes.length < 2} onclick={group}>{t("group")}</button>
      <button type="button" class="dg-btn" disabled={!shapes.some((shape) => shape.groupId)} onclick={ungroup}>{t("ungroup")}</button>
    </div>
    <SelectionActions {onLock} {onCopyStyle} {onPasteStyle} canPaste={ui.style?.kind === "shape"}>
      <label class="dg-check">
        <input type="checkbox" bind:checked={ui.styleWithSize} />
        {t("copy_style_with_size")}
      </label>
    </SelectionActions>
  {/if}
</aside>

<style>
  .dg-hint {
    margin: 0;
    color: var(--muted);
  }
  .dg-emphasis {
    font-weight: 700;
    font-family: inherit;
  }
  .dg-emphasis-italic {
    font-style: italic;
  }
  .dg-emphasis-underline {
    text-decoration: underline;
  }
</style>

