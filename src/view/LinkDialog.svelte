<script lang="ts">
  // "Link on this shape": a shape leads to an external URL, to an existing diagram, or to a new diagram created with its
  // title. An empty URL removes the link. The link is saved as any change, and Shift+click on the shape follows it.
  import { untrack } from "svelte";
  import { type Shape, withScheme } from "../lib/diagram.ts";
  import { t, titleOf } from "../lib/i18n.ts";
  import { createLinked, diagrams, removeLink, save } from "../lib/store.svelte.ts";
  import Modal from "./Modal.svelte";

  let { shape, onClose }: { shape: Shape; onClose: () => void } = $props();

  /** The link the dialog opened on: the fields start from it. */
  const link = untrack(() => shape.link);
  /** The diagrams the shape can lead to: all but the one it is drawn in. */
  const others = $derived(diagrams.list.filter((entry) => entry.id !== diagrams.open?.id));
  const missing = link?.type === "diagram" && !diagrams.list.some((entry) => entry.id === link.value);

  let choice = $state<"url" | "diagram" | "new">(link?.type === "diagram" ? "diagram" : "url");
  let url = $state(link?.type === "url" ? link.value : "");
  let target = $state(link?.type === "diagram" && !missing ? link.value : "");
  let title = $state("");
  let error = $state("");

  // The first diagram is chosen when nothing is.
  $effect(() => {
    if (choice === "diagram" && !target && others[0]) target = others[0].id;
  });

  async function confirm() {
    error = "";
    if (choice === "url") {
      const value = url.trim();
      shape.link = value ? { type: "url", value: withScheme(value) } : null;
    } else if (choice === "diagram") {
      if (!others.some((entry) => entry.id === target)) return void (error = t("link_choose_diagram"));
      shape.link = { type: "diagram", value: target };
    } else {
      if (!title.trim()) return void (error = t("link_new_title_required"));
      try {
        shape.link = { type: "diagram", value: await createLinked(title) };
      } catch (failed) {
        return void (error = (failed as Error).message);
      }
    }
    onClose();
    await save();
  }

  function remove() {
    onClose();
    void removeLink(shape.id);
  }
</script>

<Modal open title={t("link_panel_title")} onConfirm={confirm} {onClose}>
  <fieldset class="dg-link-choice">
    <legend>{t("link_type")}</legend>
    <label><input type="radio" name="link-type" value="url" bind:group={choice} /> {t("link_external")}</label>
    <label><input type="radio" name="link-type" value="diagram" bind:group={choice} /> {t("link_existing")}</label>
    <label><input type="radio" name="link-type" value="new" bind:group={choice} /> {t("link_new")}</label>
  </fieldset>

  {#if choice === "url"}
    <label for="link-url">{t("link_url")}</label>
    <input id="link-url" type="text" placeholder="https://…" bind:value={url} onkeydown={(event) => event.key === "Enter" && confirm()} />
    <p>{t("link_url_hint")}</p>
  {:else if choice === "diagram"}
    {#if others.length}
      <label for="link-diagram">{t("link_diagram")}</label>
      <select id="link-diagram" bind:value={target}>
        {#each others as entry (entry.id)}
          <option value={entry.id}>{titleOf(entry.title)}</option>
        {/each}
      </select>
    {:else}
      <p>{t("link_no_other")}</p>
    {/if}
  {:else}
    <label for="link-title">{t("link_new_title")}</label>
    <input id="link-title" type="text" bind:value={title} onkeydown={(event) => event.key === "Enter" && confirm()} />
  {/if}

  {#if missing}
    <p class="dg-link-error">{t("link_not_found")}</p>
  {/if}
  {#if error}
    <p class="dg-link-error" role="alert">{error}</p>
  {/if}
  {#if link}
    <button type="button" class="dg-btn dg-link-remove" onclick={remove}>{t("link_remove")}</button>
  {/if}
</Modal>

<style>
  .dg-link-choice {
    margin: 0;
    padding: 0;
    border: none;
    display: flex;
    flex-wrap: wrap;
    gap: 4px 14px;
  }
  .dg-link-choice legend {
    padding: 0;
    font-size: 12px;
    font-weight: 500;
    color: var(--muted);
    margin-bottom: 4px;
  }
  .dg-link-choice label {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    margin: 0;
    color: var(--ink);
    font-size: 13px;
  }
  .dg-link-choice input[type="radio"] {
    width: auto;
    margin: 0;
  }
  p.dg-link-error {
    margin-top: 10px;
    color: var(--red);
  }
  .dg-link-remove {
    margin-top: 14px;
  }
</style>
