<script lang="ts">
  // The actions the panels of the shapes and of the arrows share: "Lock", and "Copy style" / "Paste style", which
  // applies the copied style to the selection of the same kind. A panel adds its own options to the copy.
  import type { Snippet } from "svelte";
  import { t } from "../lib/i18n.ts";

  let {
    onLock,
    onCopyStyle,
    onPasteStyle,
    canPaste,
    children,
  }: { onLock: () => void; onCopyStyle: () => void; onPasteStyle: () => void; canPaste: boolean; children?: Snippet } = $props();
</script>

<div class="dg-row">
  <button type="button" class="dg-btn" title={t("copy_style_hint")} onclick={onCopyStyle}>{t("copy_style")}</button>
  {@render children?.()}
</div>
<button type="button" class="dg-btn" disabled={!canPaste} title={t("paste_style_hint")} onclick={onPasteStyle}>{t("paste_style")}</button>
<button type="button" class="dg-btn" title={t("lock_hint")} onclick={onLock}>{t("lock")}</button>
