<script lang="ts">
  // "Diagram defaults": the style a new arrow takes, and the size, text size and color a new shape of each built-in type
  // takes. A value out of its bounds is flagged in its field, and nothing is saved until it is corrected. "Reset" brings
  // back the factory values in the fields; they are saved with "Save", as any change.
  import { untrack } from "svelte";
  import { type Defaults, factoryDefaults, heightFor, outOfBounds, type Range, readDefaults, SIZES } from "../lib/defaults.ts";
  import { ARROW_WIDTHS, BUILT_IN_TYPES, COLORS, FONT_SIZES, HEADS, keepsRatio, ROUTES } from "../lib/diagram.ts";
  import { t } from "../lib/i18n.ts";
  import { creation, saveDefaults } from "../lib/store.svelte.ts";
  import Modal from "./Modal.svelte";

  let { onClose }: { onClose: () => void } = $props();

  let form = $state<Defaults>(untrack(() => $state.snapshot(creation.defaults)));
  let tried = $state(false);
  const invalid = $derived(new Set(outOfBounds(form)));

  const bounds = (range: Range) => t("defaults_bounds", { min: range.min, max: range.max });

  function confirm() {
    tried = true;
    if (invalid.size) return;
    onClose();
    void saveDefaults(readDefaults(form));
  }
</script>

<Modal open wide title={t("defaults_title")} onConfirm={confirm} {onClose}>
  <p>{t("defaults_hint")}</p>

  <h4>{t("defaults_arrows")}</h4>
  <div class="dg-defaults-arrows">
    <label>
      {t("heads")}
      <select bind:value={form.arrows.heads}>
        {#each HEADS as value (value)}<option {value}>{t(`heads_${value}`)}</option>{/each}
      </select>
    </label>
    <label>
      {t("line_style")}
      <select bind:value={form.arrows.dashed}>
        <option value={false}>{t("line_solid")}</option>
        <option value={true}>{t("line_dashed")}</option>
      </select>
    </label>
    <label>
      {t("route")}
      <select bind:value={form.arrows.route}>
        {#each ROUTES as value (value)}<option {value}>{t(`route_${value}`)}</option>{/each}
      </select>
    </label>
    <label>
      {t("color")}
      <select bind:value={form.arrows.color}>
        {#each COLORS as value (value)}<option {value}>{t(value)}</option>{/each}
      </select>
    </label>
    <label>
      {t("label_size")}
      <input type="number" aria-label={t("label_size")} min={FONT_SIZES.min} max={FONT_SIZES.max} title={bounds(FONT_SIZES)} aria-invalid={invalid.has("arrows.labelSize")} bind:value={form.arrows.labelSize} />
    </label>
    <label>
      {t("line_width")}
      <input type="number" aria-label={t("line_width")} min={ARROW_WIDTHS.min} max={ARROW_WIDTHS.max} step={ARROW_WIDTHS.step} title={bounds(ARROW_WIDTHS)} aria-invalid={invalid.has("arrows.width")} bind:value={form.arrows.width} />
    </label>
  </div>

  <h4>{t("defaults_shapes")}</h4>
  <table class="dg-defaults-shapes">
    <thead>
      <tr>
        <th scope="col">{t("defaults_type")}</th>
        <th scope="col">{t("defaults_width")}</th>
        <th scope="col">{t("defaults_height")}</th>
        <th scope="col">{t("font_size")}</th>
        <th scope="col">{t("color")}</th>
      </tr>
    </thead>
    <tbody>
      {#each BUILT_IN_TYPES as type (type)}
        {@const name = t(`type_${type}`)}
        <tr>
          <th scope="row">{name}</th>
          <td><input type="number" aria-label={`${name} · ${t("shape_width")}`} min={SIZES.min} max={SIZES.max} title={bounds(SIZES)} aria-invalid={invalid.has(`shapes.${type}.w`)} bind:value={form.shapes[type].w} /></td>
          <td>
            {#if keepsRatio(type)}
              <input type="number" aria-label={`${name} · ${t("shape_height")}`} value={heightFor(type, form.shapes[type].w ?? 0)} disabled />
            {:else}
              <input type="number" aria-label={`${name} · ${t("shape_height")}`} min={SIZES.min} max={SIZES.max} title={bounds(SIZES)} aria-invalid={invalid.has(`shapes.${type}.h`)} bind:value={form.shapes[type].h} />
            {/if}
          </td>
          <td><input type="number" aria-label={`${name} · ${t("font_size")}`} min={FONT_SIZES.min} max={FONT_SIZES.max} title={bounds(FONT_SIZES)} aria-invalid={invalid.has(`shapes.${type}.fontSize`)} bind:value={form.shapes[type].fontSize} /></td>
          <td>
            <select aria-label={`${name} · ${t("color")}`} bind:value={form.shapes[type].color}>
              {#each COLORS as value (value)}<option {value}>{t(value)}</option>{/each}
            </select>
          </td>
        </tr>
      {/each}
    </tbody>
  </table>

  {#if tried && invalid.size}
    <p class="dg-defaults-error" role="alert">{t("defaults_out_of_bounds")}</p>
  {/if}
  <button type="button" class="dg-btn dg-defaults-reset" title={t("defaults_reset_hint")} onclick={() => ((form = factoryDefaults()), (tried = false))}>{t("defaults_reset")}</button>
</Modal>

<style>
  h4 {
    margin: 16px 0 0;
    font-size: 13px;
    font-weight: 600;
    color: var(--ink);
  }
  .dg-defaults-arrows {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
    gap: 0 12px;
  }
  .dg-defaults-shapes {
    width: 100%;
    margin-top: 8px;
    border-collapse: collapse;
    font-size: 12px;
  }
  .dg-defaults-shapes th {
    text-align: left;
    font-weight: 500;
    color: var(--muted);
    padding: 2px 4px;
  }
  .dg-defaults-shapes td {
    padding: 2px 4px;
  }
  .dg-defaults-shapes input {
    width: 76px;
    padding: 4px 6px;
  }
  .dg-defaults-shapes select {
    padding: 4px 6px;
  }
  input[aria-invalid="true"] {
    border-color: var(--red);
    outline: 1px solid var(--red);
  }
  p.dg-defaults-error {
    margin-top: 12px;
    color: var(--red);
  }
  .dg-defaults-reset {
    margin-top: 14px;
  }
</style>
