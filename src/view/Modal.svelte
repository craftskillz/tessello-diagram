<script lang="ts">
  // A dialog drawn in the page: `confirm` and `alert` are unavailable in the sandbox (CONVENTION.md §4).
  import type { Snippet } from "svelte";
  import { t } from "../lib/i18n.ts";

  let {
    open = false,
    title = "",
    confirmLabel = t("save"),
    danger = false,
    wide = false,
    onConfirm,
    onClose,
    children,
  }: {
    open?: boolean;
    title?: string;
    confirmLabel?: string;
    danger?: boolean;
    /** A dialog with a table, wider than a form. */
    wide?: boolean;
    onConfirm: () => void;
    onClose: () => void;
    children: Snippet;
  } = $props();

  const titleId = `modal-${Math.random().toString(36).slice(2)}`;
  let dialog = $state<HTMLElement>();

  // Puts the focus on the first field, or on the confirm button of a confirmation.
  $effect(() => {
    if (open && dialog) dialog.querySelector<HTMLElement>("input, select, textarea, .dg-btn--primary")?.focus();
  });

  function onBackdrop(event: MouseEvent) {
    if (event.target === event.currentTarget) onClose();
  }
  function onKey(event: KeyboardEvent) {
    if (open && event.key === "Escape") onClose();
  }
</script>

<svelte:window onkeydown={onKey} />

{#if open}
  <div class="dg-modal-backdrop" role="presentation" onclick={onBackdrop}>
    <div class="dg-modal" class:dg-modal--wide={wide} role="dialog" aria-modal="true" aria-labelledby={titleId} bind:this={dialog}>
      <h3 class="dg-modal-title" id={titleId}>{title}</h3>
      <div class="dg-modal-body">
        {@render children()}
      </div>
      <div class="dg-modal-actions">
        <button type="button" class="dg-btn" onclick={onClose}>{t("cancel")}</button>
        <button type="button" class="dg-btn dg-btn--primary" class:dg-btn--danger={danger} onclick={onConfirm}>{confirmLabel}</button>
      </div>
    </div>
  </div>
{/if}

<style>
  .dg-modal-backdrop {
    position: fixed;
    inset: 0;
    background: rgb(15 23 42 / 45%);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 1000;
    padding: 16px;
  }
  .dg-modal {
    width: 100%;
    max-width: 440px;
    max-height: 100%;
    overflow-y: auto;
    background: var(--panel);
    border: 1px solid var(--line);
    border-radius: 14px;
    box-shadow: var(--shadow);
    padding: 22px 24px;
  }
  .dg-modal--wide {
    max-width: 640px;
  }
  .dg-modal-title {
    margin: 0 0 16px;
    font-size: 15px;
    font-weight: 600;
    color: var(--ink);
  }
  .dg-modal-body :global(p) {
    margin: 0;
    font-size: 13px;
    color: var(--muted);
  }
  .dg-modal-body :global(label) {
    display: block;
    font-size: 12px;
    font-weight: 500;
    color: var(--muted);
    margin: 12px 0 4px;
  }
  .dg-modal-body :global(input),
  .dg-modal-body :global(select),
  .dg-modal-body :global(textarea) {
    width: 100%;
    padding: 8px 10px;
    font-size: 13px;
    border: 1px solid var(--line);
    border-radius: 8px;
    background: var(--panel-soft);
    color: var(--ink);
    font-family: inherit;
  }
  .dg-modal-body :global(textarea) {
    resize: vertical;
    min-height: 110px;
    font-family: var(--mono);
  }
  .dg-modal-body :global(input:focus),
  .dg-modal-body :global(select:focus),
  .dg-modal-body :global(textarea:focus) {
    outline: none;
    border-color: var(--accent);
  }
  .dg-modal-actions {
    display: flex;
    justify-content: flex-end;
    gap: 8px;
    margin-top: 22px;
  }
  .dg-btn {
    font-size: 12px;
    padding: 7px 16px;
    border-radius: 8px;
    border: 1px solid var(--line-strong);
    background: var(--panel-soft);
    color: var(--ink);
    cursor: pointer;
    font-family: inherit;
  }
  .dg-btn:hover {
    background: var(--accent-soft);
  }
  .dg-btn--primary {
    background: var(--accent);
    border-color: var(--accent);
    color: #fff;
  }
  .dg-btn--primary:hover {
    background: var(--accent-strong);
  }
  .dg-btn--danger,
  .dg-btn--danger:hover {
    background: var(--red);
    border-color: var(--red);
  }
</style>
