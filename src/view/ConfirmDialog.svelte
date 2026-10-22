<script lang="ts">
  // Shows the question asked with `ask` (lib/confirmation.svelte.ts).
  import { answer, pending } from "../lib/confirmation.svelte.ts";
  import Modal from "./Modal.svelte";
</script>

<Modal
  open={pending.question !== null}
  title={pending.question?.title}
  confirmLabel={pending.question?.action}
  danger={pending.question?.danger}
  onConfirm={() => answer(true)}
  onClose={() => answer(false)}
>
  <p>{pending.question?.message}</p>
</Modal>
