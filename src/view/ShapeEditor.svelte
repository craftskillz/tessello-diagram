<script lang="ts">
  // The shape editor: libraries of custom shapes made from pictures, each with its size, where its text goes, whether
  // the palette of the canvas offers it, and its anchors (lib/library.ts). Each change is saved when it is made, with the
  // indicator of the diagrams; a new shape is saved once it has a picture. Deleting a shape asks first, and says how
  // many diagrams use it.
  import { ask } from "../lib/confirmation.svelte.ts";
  import { LABEL_PLACEMENTS, newId } from "../lib/diagram.ts";
  import type { Anchor } from "../lib/geometry.ts";
  import { t } from "../lib/i18n.ts";
  import { captionOf } from "../lib/images.ts";
  import { addAnchor, clampPart, clampShapeSize, type CustomShape, DEFAULT_ANCHORS, type Draft, NAME_LENGTH, newCustomShape, renameAnchor, SHAPE_SIZE, type ShapeLibrary } from "../lib/library.ts";
  import { diagramsUsingShape, images, requestImages, saveLibraries, shapeLibraries, status, storeImage, ui } from "../lib/store.svelte.ts";
  import SaveStatus from "./SaveStatus.svelte";

  /** The side of the preview, in pixels: the shape is drawn as large as fits. */
  const PREVIEW = 280;

  /** With no library yet, "My shapes" is offered, and written with the first change made in it. */
  const offered = $state<ShapeLibrary>({ id: newId("library"), name: t("library_default"), shapes: [] });
  const libraries = $derived(shapeLibraries.list.length ? shapeLibraries.list : [offered]);

  let libraryId = $state<string | null>(null);
  let shapeId = $state<string | null>(null);
  /** A new shape, until it has a picture. */
  let draft = $state<Draft | null>(null);
  /** Why the last picture was refused. */
  let imageError = $state("");
  /** The anchor dragged on the preview, by its position in the list. */
  let dragged = $state<number | null>(null);
  let preview = $state<HTMLElement>();

  const library = $derived(libraries.find((library) => library.id === libraryId) ?? libraries[0]);
  /** The shape edited: the new one, else the one chosen, else the first of the library. */
  const edited: Draft | CustomShape | undefined = $derived(draft ?? library.shapes.find((shape) => shape.id === shapeId) ?? library.shapes[0]);
  const scale = $derived(edited ? PREVIEW / Math.max(edited.width, edited.height) : 1);

  $effect(() => {
    requestImages(libraries.flatMap((library) => library.shapes.map((shape) => shape.imageKey)));
  });

  /** The library offered becomes one of the libraries, to be written. */
  function adoptOffered(library: ShapeLibrary) {
    if (!shapeLibraries.list.includes(library)) shapeLibraries.list.push(library);
  }

  /** Saves a change of the shape edited; a new shape waits for its picture. */
  function changed() {
    if (draft) return;
    void saveLibraries();
  }

  function chooseLibrary(id: string) {
    libraryId = id;
    shapeId = null;
    draft = null;
  }

  function createLibrary() {
    const created: ShapeLibrary = { id: newId("library"), name: t("library_new"), shapes: [] };
    shapeLibraries.list.push(created);
    chooseLibrary(created.id);
    void saveLibraries();
  }

  /** An empty name keeps the one the library had. */
  function renameLibrary(field: HTMLInputElement) {
    const name = field.value.trim();
    field.value = name || library.name;
    if (!name || name === library.name) return;
    adoptOffered(library);
    library.name = name;
    void saveLibraries();
  }

  function startShape() {
    draft = newCustomShape(newId("custom"), t("shape_new"));
    imageError = "";
  }

  function chooseShape(id: string) {
    draft = null;
    shapeId = id;
    imageError = "";
  }

  /** An empty name is "Untitled shape". */
  function rename(shape: Draft | CustomShape, field: HTMLInputElement) {
    shape.name = field.value.trim().slice(0, NAME_LENGTH) || t("shape_untitled");
    field.value = shape.name;
    changed();
  }

  /** The picture is stored at once; a new shape takes the name of its file, if it has no other yet, and is saved. */
  async function choosePicture(field: HTMLInputElement) {
    const file = field.files?.[0];
    field.value = "";
    const shape = edited;
    if (!file || !shape) return;
    imageError = "";
    try {
      shape.imageKey = (await storeImage(file)).key;
    } catch (error) {
      imageError = (error as Error).message;
      return;
    }
    if (shape === draft) {
      if (!draft.name || draft.name === t("shape_new")) draft.name = captionOf(file.name).slice(0, NAME_LENGTH);
      const saved = $state.snapshot(draft) as CustomShape;
      adoptOffered(library);
      library.shapes.push(saved);
      shapeId = saved.id;
      draft = null;
    }
    void saveLibraries();
  }

  function setSize(shape: Draft | CustomShape, side: "width" | "height", field: HTMLInputElement) {
    shape[side] = clampShapeSize(field.valueAsNumber);
    field.value = String(shape[side]);
    changed();
  }

  function setAnchors(shape: Draft | CustomShape, anchors: Anchor[]) {
    shape.anchors = anchors;
    changed();
  }

  /** The point of the shape under the pointer, as parts of its width and height. */
  function partsAt(event: PointerEvent | MouseEvent) {
    const box = preview!.getBoundingClientRect();
    return { x: (event.clientX - box.left) / box.width, y: (event.clientY - box.top) / box.height };
  }

  function onPreviewClick(event: MouseEvent) {
    if (edited) setAnchors(edited, addAnchor(edited.anchors, partsAt(event)));
  }

  function startDrag(event: PointerEvent, index: number) {
    if (event.button !== 0) return;
    event.stopPropagation();
    event.preventDefault();
    dragged = index;
  }

  function onPointerMove(event: PointerEvent) {
    if (dragged === null || !edited) return;
    const { x, y } = partsAt(event);
    edited.anchors[dragged] = { ...edited.anchors[dragged], x: clampPart(x), y: clampPart(y) };
  }

  function onPointerUp() {
    if (dragged === null) return;
    dragged = null;
    changed();
  }

  async function deleteShape(shape: CustomShape) {
    const count = await diagramsUsingShape(library.id, shape.id);
    const usage = count === 0 ? t("confirm_delete_shape_unused") : count === 1 ? t("confirm_delete_shape_used_one") : t("confirm_delete_shape_used", { count });
    if (!(await ask(t("confirm_delete_shape_title"), `${t("confirm_delete_shape_msg", { name: shape.name })} ${usage}`))) return;
    const owner = shapeLibraries.list.find((library) => library.shapes.includes(shape));
    if (!owner) return;
    owner.shapes = owner.shapes.filter((other) => other !== shape);
    shapeId = null;
    void saveLibraries();
  }

  const percent = (part: number) => `${Math.round(part * 100)}%`;
  const anchorCount = (count: number) => (count === 0 ? t("anchor_count_none") : count === 1 ? t("anchor_count_one") : t("anchor_count", { count }));
</script>

<svelte:window onpointermove={onPointerMove} onpointerup={onPointerUp} />

<div class="dg-editor">
  <header class="dg-editor-head">
    <button type="button" class="dg-btn" onclick={() => (ui.screen = "diagram")}>{t("shapes_back")}</button>
    <h1>{t("shapes_title")}</h1>
    <SaveStatus />
  </header>
  {#if status.saveError}
    <p class="dg-banner" role="alert">{status.saveError}</p>
  {/if}

  <div class="dg-editor-body">
    <nav class="dg-libraries" aria-label={t("shapes_libraries")}>
      <div class="dg-row">
        <label class="dg-field">
          <span>{t("library")}</span>
          <select value={library.id} onchange={(event) => chooseLibrary(event.currentTarget.value)}>
            {#each libraries as option (option.id)}
              <option value={option.id}>{option.name}</option>
            {/each}
          </select>
        </label>
        <button type="button" class="dg-btn" aria-label={t("library_new")} title={t("library_new")} onclick={createLibrary}>+</button>
      </div>
      {#key library.id}
        <label class="dg-field">
          <span>{t("library_name")}</span>
          <input value={library.name} onchange={(event) => renameLibrary(event.currentTarget)} onkeydown={(event) => event.key === "Enter" && event.currentTarget.blur()} />
        </label>
      {/key}
      <button type="button" class="dg-btn" onclick={startShape}>{t("shape_new")}</button>
      {#if library.shapes.length === 0}
        <p class="dg-hint">{t("shape_none")}</p>
      {:else}
        <ul>
          {#each library.shapes as shape (shape.id)}
            <li>
              <button type="button" class="dg-shape-item" aria-current={!draft && shape === edited ? "true" : undefined} onclick={() => chooseShape(shape.id)}>
                {#if images[shape.imageKey]}
                  <img src={images[shape.imageKey]} alt="" />
                {:else}
                  <span class="dg-thumb"></span>
                {/if}
                <span>{shape.name}</span>
              </button>
            </li>
          {/each}
        </ul>
      {/if}
    </nav>

    <main class="dg-shape-form">
      {#if !edited}
        <p class="dg-hint">{t("shape_none")}</p>
      {:else}
        {@const shape = edited}
        {#key draft ? "draft" : shape.id}
          <label class="dg-field">
            <span>{t("shape_name")}</span>
            <input value={shape.name} maxlength={NAME_LENGTH} onchange={(event) => rename(shape, event.currentTarget)} onkeydown={(event) => event.key === "Enter" && event.currentTarget.blur()} />
          </label>
        {/key}
        <label class="dg-field">
          <span>{t("shape_image")}</span>
          <input type="file" accept="image/*,.svg" onchange={(event) => choosePicture(event.currentTarget)} />
        </label>
        {#if !shape.imageKey}
          <p class="dg-notice" role="status">{t("shape_needs_image")}</p>
        {/if}
        {#if imageError}
          <p class="dg-banner" role="alert">{imageError}</p>
        {/if}
        <div class="dg-row">
          <label class="dg-field">
            <span>{t("shape_width")}</span>
            <input type="number" min={SHAPE_SIZE.min} max={SHAPE_SIZE.max} value={shape.width} onchange={(event) => setSize(shape, "width", event.currentTarget)} />
          </label>
          <label class="dg-field">
            <span>{t("shape_height")}</span>
            <input type="number" min={SHAPE_SIZE.min} max={SHAPE_SIZE.max} value={shape.height} onchange={(event) => setSize(shape, "height", event.currentTarget)} />
          </label>
        </div>
        <label class="dg-field">
          <span>{t("shape_placement")}</span>
          <select value={shape.labelPlacement} onchange={(event) => ((shape.labelPlacement = event.currentTarget.value as Draft["labelPlacement"]), changed())}>
            {#each LABEL_PLACEMENTS as placement (placement)}
              <option value={placement}>{t(`placement_${placement}`)}</option>
            {/each}
          </select>
        </label>
        <label class="dg-check" title={t("shape_in_palette_hint")}>
          <input type="checkbox" checked={shape.showInDiagram} onchange={(event) => ((shape.showInDiagram = event.currentTarget.checked), changed())} />
          {t("shape_in_palette")}
        </label>

        <p class="dg-hint">{t("shape_preview_hint")}</p>
        <!-- A click adds an anchor where it is; the anchors are dragged by their markers. -->
        <div
          bind:this={preview}
          class="dg-preview"
          role="button"
          tabindex="-1"
          aria-label={t("shape_preview")}
          style:width="{shape.width * scale}px"
          style:height="{shape.height * scale}px"
          onclick={onPreviewClick}
          onkeydown={() => {}}
        >
          {#if shape.imageKey && images[shape.imageKey]}
            <img src={images[shape.imageKey]} alt="" draggable="false" />
          {/if}
          {#each shape.anchors as anchor, index (index)}
            <span
              class="dg-anchor"
              role="button"
              tabindex="-1"
              aria-label={t("anchor_marker", { id: anchor.id })}
              title={anchor.id}
              style:left={percent(anchor.x)}
              style:top={percent(anchor.y)}
              onpointerdown={(event) => startDrag(event, index)}
              onclick={(event) => event.stopPropagation()}
              onkeydown={() => {}}
            ></span>
          {/each}
        </div>

        <section class="dg-anchors" aria-label={t("anchors")}>
          <div class="dg-row">
            <h2>{t("anchors")}</h2>
            <span class="dg-hint">{anchorCount(shape.anchors.length)}</span>
          </div>
          <div class="dg-row">
            <button type="button" class="dg-btn" onclick={() => setAnchors(shape, DEFAULT_ANCHORS.map((anchor) => ({ ...anchor })))}>{t("anchors_default")}</button>
            <button type="button" class="dg-btn" onclick={() => setAnchors(shape, [])}>{t("anchors_clear")}</button>
          </div>
          <ul>
            {#each shape.anchors as anchor, index (index)}
              <li class="dg-row">
                <input
                  aria-label={t("anchor_id", { index: index + 1 })}
                  value={anchor.id}
                  onchange={(event) => {
                    setAnchors(shape, renameAnchor(shape.anchors, index, event.currentTarget.value));
                    event.currentTarget.value = shape.anchors[index].id;
                  }}
                />
                <span class="dg-hint">{percent(anchor.x)}, {percent(anchor.y)}</span>
                <button type="button" class="dg-btn" aria-label={t("anchor_remove", { id: anchor.id })} title={t("anchor_remove", { id: anchor.id })} onclick={() => setAnchors(shape, shape.anchors.filter((_, position) => position !== index))}>×</button>
              </li>
            {/each}
          </ul>
        </section>

        {#if !draft}
          <button type="button" class="dg-btn dg-danger" onclick={() => deleteShape(shape as CustomShape)}>{t("shape_delete")}</button>
        {/if}
      {/if}
    </main>
  </div>
</div>

<style>
  .dg-editor {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
  }
  .dg-editor-head {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 8px 12px;
    border-bottom: 1px solid var(--line);
    background: var(--panel);
  }
  h1 {
    margin: 0;
    font-size: 15px;
  }
  h2 {
    margin: 0;
    font-size: 12px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: var(--muted);
  }
  .dg-editor-body {
    flex: 1;
    min-height: 0;
    display: flex;
  }
  .dg-libraries {
    width: 240px;
    flex-shrink: 0;
    display: flex;
    flex-direction: column;
    gap: 10px;
    padding: 12px;
    border-right: 1px solid var(--line);
    background: var(--panel);
    overflow-y: auto;
  }
  ul {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 4px;
  }
  .dg-shape-item {
    width: 100%;
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 5px 6px;
    border: none;
    border-radius: 8px;
    background: none;
    color: var(--ink);
    font: inherit;
    font-size: 13px;
    text-align: left;
    cursor: pointer;
  }
  .dg-shape-item:hover,
  .dg-shape-item[aria-current="true"] {
    background: var(--accent-soft);
  }
  .dg-shape-item img,
  .dg-thumb {
    width: 28px;
    height: 28px;
    object-fit: contain;
    flex-shrink: 0;
  }
  .dg-shape-form {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 10px;
    padding: 16px;
    overflow-y: auto;
  }
  .dg-hint {
    margin: 0;
    font-size: 12px;
    color: var(--muted);
  }
  .dg-notice {
    margin: 0;
    font-size: 13px;
    color: var(--accent-strong);
  }
  .dg-banner {
    margin: 0;
    padding: 10px 14px;
    border: 1px solid var(--red);
    background: var(--red-soft);
    font-size: 13px;
  }
  .dg-preview {
    position: relative;
    flex-shrink: 0;
    margin: 12px;
    /* Outside the box, so that the box is the picture, where a click places an anchor. */
    box-shadow: 0 0 0 1px var(--line);
    background: var(--bg);
    cursor: crosshair;
    outline: none;
  }
  .dg-preview img {
    width: 100%;
    height: 100%;
    display: block;
    pointer-events: none;
  }
  .dg-anchor {
    position: absolute;
    width: 12px;
    height: 12px;
    margin: -6px 0 0 -6px;
    border: 2px solid var(--accent);
    border-radius: 50%;
    background: var(--bg);
    cursor: move;
    outline: none;
  }
  .dg-anchors {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .dg-anchors input {
    width: 100px;
    padding: 4px 6px;
    font: inherit;
    font-size: 13px;
    border: 1px solid var(--line);
    border-radius: 6px;
    background: var(--bg);
    color: var(--ink);
  }
  .dg-danger:hover {
    color: var(--red);
    border-color: var(--red);
  }
</style>
