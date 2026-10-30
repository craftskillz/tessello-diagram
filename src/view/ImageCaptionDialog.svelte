<script lang="ts">
  // "Caption this image?": asked before an image, pasted or chosen, is stored. "With caption" (Enter) places the image
  // with its caption as a group, "Without caption" or an empty caption places the image alone, Cancel places nothing.
  import { untrack } from "svelte";
  import type { Point } from "../lib/geometry.ts";
  import { t } from "../lib/i18n.ts";
  import { insertImage } from "../lib/store.svelte.ts";
  import Modal from "./Modal.svelte";

  let { request, onClose }: { request: { file: Blob; caption: string; at: Point }; onClose: () => void } = $props();

  // Read once: the request is gone from the canvas as soon as the dialog closes, before it is unmounted.
  const { file, at } = untrack(() => request);
  let text = $state(untrack(() => request.caption));
  let field = $state<HTMLInputElement>();

  // The caption is focused and selected: one keystroke replaces it.
  $effect(() => {
    field?.focus();
    field?.select();
  });

  function place(withCaption: boolean) {
    onClose();
    void insertImage(file, withCaption ? text : undefined, at);
  }
</script>

<Modal
  open
  title={t("image_caption_title")}
  confirmLabel={t("image_with_caption")}
  secondaryLabel={t("image_without_caption")}
  onConfirm={() => place(true)}
  onSecondary={() => place(false)}
  {onClose}
>
  <label for="image-caption">{t("image_caption")}</label>
  <input id="image-caption" type="text" bind:value={text} bind:this={field} onkeydown={(event) => event.key === "Enter" && place(true)} />
</Modal>
