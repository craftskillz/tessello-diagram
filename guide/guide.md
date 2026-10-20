# Diagram

**Draw architecture and process diagrams: shapes, and the arrows that connect them.**

Every change is saved the moment you finish it. There is no Save button.

## Your diagrams

The list on the left holds your diagrams. Click **+ New** to create one: it opens at once, titled **New diagram**. Click a title to open that diagram. Rename the open diagram in the title field at the top; an empty title becomes **Untitled**.

To delete a diagram, point at it in the list and click **×**, then confirm. A deleted diagram cannot be brought back.

## Drawing

Pick a tool at the top, or press its key:

- **Select (S)**: click a shape or an arrow to select it, drag a shape to move it. **Ctrl+click** (**Cmd+click** on a Mac) adds a shape or an arrow to the selection or takes it out, **Ctrl+A** selects everything, and a drag on an empty spot selects what it surrounds entirely. **Delete** removes the selection: the arrows attached to a removed shape stay where they were, their ends left free. **Ctrl+Delete** (**Cmd+Delete**) also removes the arrows of the shape. **Escape** returns to this tool.
- **Rectangle (R)**, **Ellipse (E)**, **Database (D)**, **Circle (C)**, **Actor (A)**, **Post-it (P)** and **Free text (T)**: double-click an empty spot to place the shape and type its text. **Enter** applies the text, **Shift+Enter** adds a line, **Escape** abandons it. The text wraps within the width of the shape. Double-click a shape, or click **Edit text**, to change its text.
- **Arrow (F)**: press anywhere, drag and release. See below.

## Arrows

With the **Arrow** tool, press, drag and release: one gesture draws the arrow, wherever it starts. **Shift** keeps it at a multiple of 45°. A click without a drag draws nothing.

While you draw, the shape under the pointer shows its eight points: its corners and the middles of its sides, on its outline. Each end of the arrow lands where you release it:

- **on a point**, which lights up as you reach it: the end stays on that point, even when the shape turns;
- **elsewhere on a shape**: the end is automatic, and meets the outline on the way to the other end;
- **on an empty spot**: the end is free, and stays where it is.

The arrow follows its shapes when you move, resize or turn them. Several arrows between the same two shapes are drawn side by side, and arrows that share a point spread out from it, so that each stays visible. Click anywhere on an arrow's line to select it.

A selected arrow shows a handle at each end: drag one onto another point or shape, or onto an empty spot to free it. An arrow whose two ends are free moves when you drag its line. **Detach ends**, in the panel, makes the ends attached to a point automatic.

You cannot attach an arrow to a locked shape: an end released on it stays free.

## Resizing, turning and styling

Drag a corner of the selected shape to resize it. Hold **Shift** to keep its proportions; an actor and a circle always keep them. The button at the top chooses whether the opposite corner or the center stays in place.

Drag the round handle above the shape to turn it (**Shift** turns by steps of 15°), or use the rotation buttons of the panel, by 10°. The handle marked **T** turns the text alone.

The panel on the right styles every selected shape: its color, the opacity of its background, the size and alignment of its text, and whether it is in front of or behind the others.

To move around the canvas, use the wheel, or drag while holding **Space** or the middle button. **Ctrl+wheel** (**Cmd+wheel** on a Mac) zooms.

## Your data

Your diagrams are kept in Tessello's storage on your computer, and nowhere else. The Diagram Module contacts no server. Uninstalling it deletes your diagrams.

## When something goes wrong

- **Save failed**: your last change is still on screen, but it is not saved and will be lost when you leave. The message tells you why; when the storage is full, delete diagrams you no longer need.
- **Your diagrams could not be read**: nothing can be changed until they are read, so that nothing is lost. Click **Try again**.
