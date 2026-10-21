# Diagram

**Draw architecture and process diagrams: shapes, and the arrows that connect them.**

Every change is saved the moment you finish it. There is no Save button.

**Ctrl+Z** (**Cmd+Z** on a Mac) undoes the last change, and **Ctrl+Shift+Z** (**Cmd+Shift+Z**) makes it again. Every change of the diagram can be undone, up to the last 100: shapes, arrows, their style and text, groups, locks, the order, the title, the grid and the guides. Moving around the canvas, zooming and selecting are not changes. The history starts over each time you open a diagram. While you type in a field, these keys undo your typing instead.

## Your diagrams

The list on the left holds your diagrams. Click **+ New** to create one: it opens at once, titled **New diagram**. Click a title to open that diagram. Rename the open diagram in the title field at the top; an empty title becomes **Untitled**.

To delete a diagram, point at it in the list and click **×**, then confirm. A deleted diagram cannot be brought back.

On the Home, the Diagram Widget lists the four diagrams you changed last, with how long ago. Click one to open it, or **+ New** to open a new diagram.

## Drawing

Pick a tool at the top, or press its key:

- **Select (S)**: click a shape or an arrow to select it, drag a shape to move it. **Ctrl+click** (**Cmd+click** on a Mac) adds a shape or an arrow to the selection or takes it out, **Ctrl+A** selects everything, and a drag on an empty spot selects what it surrounds entirely. **Delete** removes the selection: the arrows attached to a removed shape stay where they were, their ends left free. **Ctrl+Delete** (**Cmd+Delete**) also removes the arrows of the shape. **Escape** returns to this tool.
- **Rectangle (R)**, **Ellipse (E)**, **Database (D)**, **Circle (C)**, **Actor (A)**, **Post-it (P)** and **Free text (T)**: double-click an empty spot to place the shape and type its text. **Enter** applies the text, **Shift+Enter** adds a line, **Escape** abandons it. The text wraps within the width of the shape. Double-click a shape, or click **Edit text**, to change its text.
- **Arrow (F)**: press anywhere, drag and release. See below.
- **Image (I)**: double-click an empty spot and choose a picture. See below.

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

Drag the label to slide it along the arrow, or away from it on either side: it keeps its place on the arrow when the arrow moves. On a selected arrow, the small handle on the right edge of the label sets the width its lines wrap within. The panel sets the size of its text, from 6 to 72, and turns it by steps of 15°. **Reset label** brings it back to the middle of the arrow, at its automatic width.

## Resizing, turning and styling

Drag a corner of the selected shape to resize it. Hold **Shift** to keep its proportions; an actor and a circle always keep them. The button at the top chooses whether the opposite corner or the center stays in place.

Drag the round handle above the shape to turn it (**Shift** turns by steps of 15°), or use the rotation buttons of the panel, by 10°. The handle marked **T** turns the text alone.

The panel on the right styles every selected shape: its color, the opacity of its background, the size and alignment of its text, and whether it is in front of or behind the others.

Select a shape and click **Copy style** (**Ctrl+Alt+C**, **Cmd+Option+C** on a Mac) to copy its color, the opacity of its background, and the size and alignment of its text; tick **with size** to copy its width and height too. Then select other shapes and click **Paste style** (**Ctrl+Alt+V**, **Cmd+Option+V**). An arrow's style is copied the same way, onto other arrows: its arrowheads, its line, its width, its color, the size of its label and its route.

### Default styles

**Defaults** in the toolbar opens **Diagram defaults**: the arrowheads, line, route, width, color and label size of new arrows, and the width, height, text size and color of new shapes of each built-in type. Sizes go from 10 to 800, and text from 6 to 72: a value out of bounds is outlined in red, and nothing is saved until it is corrected. **Reset** brings back the factory values, saved when you click **Save**. A circle and an actor keep their proportions: their height follows their width.

To start from a shape you styled, select it and click **Save as default for this shape type**; on an arrow, **Save as default for arrows**. Defaults change only the shapes and arrows you create afterwards, never those already drawn. Custom shapes keep the size of their definition.

## Groups, locks and copies

Select at least two shapes and click **Group selection**. A click on a member of the group then selects the whole group, outlined by a dashed line: it moves, resizes by its corners and takes a style as one block. **Alt+click** (**Option+click** on a Mac) selects a member alone. **Ungroup** undoes the groups of the selection.

Click **Lock** to protect the selected shapes or arrows. A locked item is still selected by a click, with a padlock, but it can no longer be moved, resized or deleted, and its panel offers only **Unlock**. A selection rectangle and **Ctrl+A** leave locked items out.

**Ctrl+C** (**Cmd+C**) copies the selected shapes, with the arrows between them. **Ctrl+V** (**Cmd+V**) pastes them, a little further down and to the right each time. A pasted group is a new group, apart from the one it was copied from.

## Images

With the **Image** tool, double-click an empty spot and choose a picture: it is placed there. **Ctrl+V** (**Cmd+V**) pastes a picture you copied elsewhere, such as a screenshot, in the middle of the view.

The picture comes with its caption below it: the name of its file without its extension, or **image** for a pasted picture. The two form a group; double-click the caption to change it like any text, or **Ungroup** them.

A picture is reduced to 1600 pixels on its longest side and stored once, however many times you place it. A picture still larger than about 900 KB, or one that would fill the storage, is refused with a message, and nothing is placed: try a smaller one.

If a picture can no longer be found in the storage, its place shows a **missing image** frame.

## Custom shapes

Click **Shapes** in the toolbar to open the shape editor, and **← Back to diagram** to return. Shapes are kept in libraries: pick one in **Library**, create another with **+**, and rename it in **Library name**.

Click **New shape** and choose its **Image**: the shape is saved as soon as it has one, and every change after that is saved as you make it. Give it a name, a width and a height (16 to 1200), and choose where its text goes: below, above, to the right, to the left, or centered on the picture.

Its anchors are the points where arrows attach to it. Click the preview to add one, drag it to move it, and rename or remove it in the list; two anchors never share a name. **Use 8 default anchors** puts back the corners and the middles of the sides. **Clear anchors** leaves none: arrows then attach to the shape automatically only.

The shapes ticked **Show in diagram palette** appear at the bottom of the canvas. Click one, then double-click the canvas to place it, at its size and with its name as its text. The panel changes where its text goes on that shape alone. A change made in the editor, to its picture or its anchors, shows on every shape already placed; untick **Show in diagram palette** to stop offering it without changing them.

**Delete shape** asks first, and tells you how many diagrams use it. There, it then shows as a dashed frame with its name, and its arrows stay attached.

## Links

A shape can lead to a web page or to another diagram. Select it alone and click **Link…** in its panel, then choose:

- **External URL**: type the address; without `http://`, `https://`, `mailto:` or `tel:`, `https://` is added. Leave it empty to remove the link;
- **Existing diagram**: choose it in the list, which does not offer the diagram you are in;
- **New diagram**: type its title, which is required. The diagram is created empty.

A linked shape shows a chain at its bottom right corner, blue for a page and orange for a diagram. **Shift+click** it to follow the link, with any tool but the Arrow: a page opens in a new tab, and a diagram opens in its place. **← Back to "…"**, at the top left of the canvas, returns to the diagram you came from, one link at a time; opening a diagram from the list forgets the way back. **Remove link**, in the same panel, takes the link away. A link is saved like any other change, and **Ctrl+Z** undoes it.

## Grid, guides and zoom

A shape you move snaps to the **Grid**, every 20 units; press **G** or click **Grid (G)** to turn it off or on. While you move a shape, **Guides** line it up with the edges and centers of the other shapes, and show the line it follows; they win over the grid. Both are on in a new diagram, and each diagram keeps its own choice.

To move around the canvas, use the wheel, or drag while holding **Space** or the middle button. **Ctrl+wheel** (**Cmd+wheel** on a Mac) zooms, as do the **−** and **+** buttons at the bottom left, beside the zoom level. **Fit** shows the whole drawing.

## Your data

Your diagrams and their pictures are kept in Tessello's storage on your computer, and nowhere else. The Diagram Module contacts no server. Uninstalling it deletes your diagrams.

The gauge below the list of diagrams, **Storage: x.x MB / 5 MB**, shows how much of its storage the Module uses; it turns red past 80%. Pictures take most of it. A picture is removed from the storage once no diagram uses it, and it can no longer be brought back by **Ctrl+Z**: when you open another diagram, or the next time the Diagram Module starts.

## When something goes wrong

- **Save failed**: your last change is still on screen, but it is not saved and will be lost when you leave. The message tells you why; when the storage is full, delete pictures or diagrams you no longer need.
- **Diagram not found**: the diagram a shape leads to was deleted. Click **Remove link**, or link the shape to another diagram.
- **Your diagrams could not be read**: nothing can be changed until they are read, so that nothing is lost. Click **Try again**.
