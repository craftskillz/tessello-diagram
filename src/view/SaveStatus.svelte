<script lang="ts">
  // Whether the last change is saved, the same for a diagram and for the shape editor: there is no Save button, each
  // change is saved when it is made.
  import { t } from "../lib/i18n.ts";
  import { status } from "../lib/store.svelte.ts";
</script>

<p class="dg-save" class:failed={status.saveError} role="status">
  {status.saveError ? t("save_failed") : status.saving ? t("saving") : t("saved")}
</p>

<style>
  .dg-save {
    margin: 0 0 0 auto;
    font-size: 12px;
    color: var(--muted);
  }
  .dg-save.failed {
    color: var(--red);
    font-weight: 600;
  }
</style>
