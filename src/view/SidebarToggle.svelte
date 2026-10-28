<script module lang="ts">
  /** The id of the sidebar the button controls. */
  export const SIDEBAR_ID = "dg-sidebar";
</script>

<script lang="ts">
  // The burger button that hides the list of diagrams, or shows it again. It is in the sidebar while it is open, and in the
  // top bar while it is closed, so only one of the two is ever visible.
  import { tick } from "svelte";
  import { t } from "../lib/i18n.ts";
  import { ui } from "../lib/store.svelte.ts";

  const label = $derived(ui.sidebarOpen ? t("sidebar_hide") : t("sidebar_show"));

  async function toggle(event: MouseEvent) {
    const button = event.currentTarget as HTMLButtonElement;
    const hadFocus = document.activeElement === button;
    ui.sidebarOpen = !ui.sidebarOpen;
    if (!hadFocus) return;
    // The button that was clicked leaves the screen: the focus moves to the one that appears.
    await tick();
    const visible = [...document.querySelectorAll<HTMLButtonElement>(".dg-sidebar-toggle")].find((each) => each.getClientRects().length > 0);
    visible?.focus();
  }
</script>

<button
  type="button"
  class="dg-btn dg-sidebar-toggle"
  aria-label={label}
  title={label}
  aria-expanded={ui.sidebarOpen}
  aria-controls={SIDEBAR_ID}
  onclick={toggle}
>
  <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 6h16M4 12h16M4 18h16" /></svg>
</button>

<style>
  .dg-sidebar-toggle {
    display: inline-flex;
    flex-shrink: 0;
    padding: 5px 7px;
  }
  .dg-sidebar-toggle svg {
    width: 16px;
    height: 16px;
    fill: none;
    stroke: currentColor;
    stroke-width: 2;
    stroke-linejoin: round;
    stroke-linecap: round;
  }
</style>
