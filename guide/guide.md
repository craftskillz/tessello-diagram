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
- **elsewhere on a shape**: the end is automatic, and meets the outline on the way to the next point of the arrow;
- **on an empty spot**: the end is free, and stays where it is.

The arrow follows its shapes when you move, resize or turn them. Several arrows between the same two shapes are drawn side by side, and arrows that share a point spread out from it, so that each stays visible. Click anywhere on an arrow's line to select it.

A selected arrow shows a handle at each end: drag one onto another point or shape, or onto an empty spot to free it. An arrow whose two ends are free moves when you drag its line. **Detach ends**, in the panel, makes the ends attached to a point automatic.

You cannot attach an arrow to a locked shape: an end released on it stays free.

### Routes and waypoints

In the panel of a selected arrow, choose its route:

- **Straight**: straight lines, from point to point;
- **Curved**: a smooth curve through its points;
- **Elbow**: horizontal and vertical segments only, which leave each shape at a right angle to its side.

A selected arrow shows a small square in the middle of each segment. Drag it to add a waypoint there, and give the arrow a corner. On an elbow arrow, dragging the square of a segment between two corners moves that segment sideways. Drag a waypoint to move it: it lines up exactly with its neighbor when you bring it close to the same height or the same column. Double-click a waypoint to remove it, or click **Reset route** to remove them all.

Waypoints stay where you put them when you move a shape: only the segments at the ends of the arrow follow it.

### Style and label

The panel of the selected arrows styles them all at once: their arrowheads (none, at the start, at the end or at both ends), a **Solid** or **Dashed** line, its width, from 1 to 8 by steps of 0.5, and its color.

Double-click an arrow or its label, or click **Edit arrow label**, to write its label. **Enter** applies it, **Shift+Enter** adds a line, **Escape** abandons it. The label sits on a background that hides the line under it.

Drag the label to slide it along the arrow, or away from it on either side: it keeps its place on the arrow when the arrow moves. On a selected arrow, the small handle on the right edge of the label sets the width its lines wrap within. The panel sets the size of its text, from 8 to 48, and turns it by steps of 15°. **Reset label** brings it back to the middle of the arrow, at its automatic width.

## Resizing, turning and styling

Drag a corner of the selected shape to resize it. Hold **Shift** to keep its proportions; an actor and a circle always keep them. The button at the top chooses whether the opposite corner or the center stays in place.

Drag the round handle above the shape to turn it (**Shift** turns by steps of 15°), or use the rotation buttons of the panel, by 10°. The handle marked **T** turns the text alone.

The panel on the right styles every selected shape: its color, the opacity of its background, the size and alignment of its text, and whether it is in front of or behind the others.

Select a shape and click **Copy style** (**Ctrl+Alt+C**, **Cmd+Option+C** on a Mac) to copy its color, the opacity of its background, and the size and alignment of its text; tick **with size** to copy its width and height too. Then select other shapes and click **Paste style** (**Ctrl+Alt+V**, **Cmd+Option+V**). An arrow's style is copied the same way, onto other arrows: its arrowheads, its line, its width, its color, the size of its label and its route.

## Groups, locks and copies

Select at least two shapes and click **Group selection**. A click on a member of the group then selects the whole group, outlined by a dashed line: it moves, resizes by its corners and takes a style as one block. **Alt+click** (**Option+click** on a Mac) selects a member alone. **Ungroup** undoes the groups of the selection.

Click **Lock** to protect the selected shapes or arrows. A locked item is still selected by a click, with a padlock, but it can no longer be moved, resized or deleted, and its panel offers only **Unlock**. A selection rectangle and **Ctrl+A** leave locked items out.

**Ctrl+C** (**Cmd+C**) copies the selected shapes, with the arrows between them. **Ctrl+V** (**Cmd+V**) pastes them, a little further down and to the right each time. A pasted group is a new group, apart from the one it was copied from.

## Grid, guides and zoom

A shape you move snaps to the **Grid**, every 20 units; press **G** or click **Grid (G)** to turn it off or on. While you move a shape, **Guides** line it up with the edges and centers of the other shapes, and show the line it follows; they win over the grid. Both are on in a new diagram, and each diagram keeps its own choice.

To move around the canvas, use the wheel, or drag while holding **Space** or the middle button. **Ctrl+wheel** (**Cmd+wheel** on a Mac) zooms, as do the **−** and **+** buttons at the bottom left, beside the zoom level. **Fit** shows the whole drawing.

## Your data

Your diagrams are kept in Tessello's storage on your computer, and nowhere else. The Diagram Module contacts no server. Uninstalling it deletes your diagrams.

## When something goes wrong

- **Save failed**: your last change is still on screen, but it is not saved and will be lost when you leave. The message tells you why; when the storage is full, delete diagrams you no longer need.
- **Your diagrams could not be read**: nothing can be changed until they are read, so that nothing is lost. Click **Try again**.
