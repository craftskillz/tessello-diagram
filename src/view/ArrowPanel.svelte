<script lang="ts">
  // The selected arrows: their route, straight, curved or elbow, "Reset route", which removes their waypoints, and
  // "Detach ends", which makes their ends attached to a port automatic. Their style and label come with ticket 05. The
  // panel is docked beside the canvas, as the panel of the shapes.
  import { type Arrow, detachEnds, ROUTES } from "../lib/diagram.ts";
  import { isAttached } from "../lib/geometry.ts";
  import { t } from "../lib/i18n.ts";
  import { save } from "../lib/store.svelte.ts";

  let { arrows }: { arrows: Arrow[] } = $props();

  const onPorts = $derived(arrows.some((arrow) => [arrow.from, arrow.to].some((end) => isAttached(end) && end.port)));
  const withWaypoints = $derived(arrows.some((arrow) => arrow.waypoints.length));
  /** The route the selected arrows share, if they share one. */
  const route = $derived(arrows.every((arrow) => arrow.route === arrows[0]?.route) ? arrows[0]?.route : undefined);

  function apply(change: (arrow: Arrow) => void) {
    arrows.forEach(change);
    void save();
  }
</script>

<aside class="dg-panel" aria-label={t("arrow_panel")}>
  <div class="dg-group" role="group" aria-label={t("route")}>
    {#each ROUTES as value (value)}
      <button type="button" class="dg-btn" aria-pressed={route === value} onclick={() => apply((arrow) => (arrow.route = value))}>{t(`route_${value}`)}</button>
    {/each}
  </div>
  <button type="button" class="dg-btn" disabled={!withWaypoints} title={t("reset_route_hint")} onclick={() => apply((arrow) => (arrow.waypoints = []))}>{t("reset_route")}</button>
  <button type="button" class="dg-btn" disabled={!onPorts} title={t("detach_ends_hint")} onclick={() => apply(detachEnds)}>{t("detach_ends")}</button>
</aside>

<style>
  .dg-group {
    display: flex;
    gap: 2px;
  }
</style>
