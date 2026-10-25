// The Widget and the way into the View: the diagram it asks the View to open, and a new diagram from its “+ New”.

import assert from "node:assert/strict";
import { test } from "node:test";
import { until } from "@tessello/sdk/testing";
import { diagramHost, newDiagram, opened, openView, openWidget, stored, storedIndex, useBrowser } from "./diagram.ts";

useBrowser();

test("the View opens the diagram its Widget asks for, in its handshake when not loaded yet, or in an event once loaded", async () => {
  const host = diagramHost();
  const view = await openView({ host });
  await newDiagram(view, "Checkout");
  await newDiagram(view, "Billing");
  const index = await storedIndex(host);
  const [billing, checkout] = ["Billing", "Checkout"].map((title) => index.find((entry) => entry.title === title)!);

  // Loaded behind the Home: the id comes in a navigation event.
  host.openView({ id: checkout.id });
  await opened(view.page, "Checkout");
  host.openView({ id: billing.id });
  await opened(view.page, "Billing");

  // Not loaded yet: the id comes in the context of its handshake.
  const again = await openView({ host, params: { id: checkout.id } });
  await opened(again.page, "Checkout");
});

test("an empty Widget says so, and its “+ New” opens the View on a single new diagram, which the Widget then lists", async () => {
  const host = diagramHost();
  const widget = await openWidget({ host });
  await widget.page.getByText("No diagrams yet").waitFor();
  await widget.page.getByRole("button", { name: "+ New" }).click();
  await until(() => host.openedViews.length === 1, "the Widget to open the View");
  assert.deepEqual(host.openedViews, [{ new: "true" }]);

  // The View is not loaded: it gets `new` in its handshake.
  const view = await openView({ host, params: { new: "true" } });
  await opened(view.page, "New diagram");
  await stored(host, (index) => index.length === 1, "the new diagram to be written");

  // The Widget, hidden behind the View, reads the diagrams again when shown.
  widget.surface.setVisible(false);
  widget.surface.setVisible(true);
  await widget.page.getByRole("list", { name: "Recent diagrams" }).getByRole("button", { name: /^New diagram/ }).waitFor();
  assert.equal(await widget.page.getByText("No diagrams yet").count(), 0);

  // The View is loaded: it gets `new` in an event, and makes one more.
  host.openView({ new: "true" });
  await stored(host, (index) => index.length === 2, "a second new diagram to be written");
  await opened(view.page, "New diagram");
  assert.equal((await storedIndex(host)).length, 2, "a single diagram is created");
});
