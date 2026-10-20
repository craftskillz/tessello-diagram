<script lang="ts">
  // The selected arrows: "Detach ends" makes their ends attached to a port automatic. Their style and label come with
  // ticket 05. The panel is docked beside the canvas, as the panel of the shapes.
  import { type Arrow, detachEnds } from "../lib/diagram.ts";
  import { isAttached } from "../lib/geometry.ts";
  import { t } from "../lib/i18n.ts";
  import { save } from "../lib/store.svelte.ts";

  let { arrows }: { arrows: Arrow[] } = $props();

  const onPorts = $derived(arrows.some((arrow) => [arrow.from, arrow.to].some((end) => isAttached(end) && end.port)));

  function detach() {
    arrows.forEach(detachEnds);
    void save();
  }
</script>

<aside class="dg-panel" aria-label={t("arrow_panel")}>
  <button type="button" class="dg-btn" disabled={!onPorts} title={t("detach_ends_hint")} onclick={detach}>{t("detach_ends")}</button>
</aside>
