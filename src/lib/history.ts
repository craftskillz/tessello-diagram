// The undo history of the open diagram: a step for each change saved, that is for each gesture ended. A step holds
// the whole content of the diagram, as JSON, so that whatever a later version stores in it is undone too. The
// selection, the zoom and the position of the view are not part of the diagram, and are not undone.

import type { Diagram } from "./diagram.ts";

/** The most steps a diagram keeps: the oldest are forgotten. */
export const STEPS = 100;

/** The content of the diagram at one step, as JSON: all of it but its id and when it was changed. */
type Snapshot = string;

export interface History {
  /** The steps before the present one, the oldest first. */
  past: Snapshot[];
  /** The diagram as it is now, as last saved or restored. */
  present: Snapshot;
  /** The steps undone, the latest undone first. */
  future: Snapshot[];
}

const snapshotOf = ({ id: _id, updatedAt: _updatedAt, ...content }: Diagram): Snapshot => JSON.stringify(content);

/** A history whose present state is the diagram as it is opened, with nothing to undo or redo. */
export function startHistory(diagram: Diagram): History {
  return { past: [], present: snapshotOf(diagram), future: [] };
}

/** Whether the diagram is as the history left it: a diagram read again unchanged goes on with its history. */
export const isPresent = (history: History, diagram: Diagram): boolean => snapshotOf(diagram) === history.present;

/**
 * Records the diagram as a step after the present one: what was undone can no longer be redone. A diagram as it is in
 * the present state, such as one just undone and saved, is not a step.
 */
export function record(history: History, diagram: Diagram): void {
  const snapshot = snapshotOf(diagram);
  if (snapshot === history.present) return;
  history.past.push(history.present);
  history.present = snapshot;
  history.future = [];
  if (history.past.length > STEPS) history.past.shift();
}

/** Restores the diagram as it was before the last step. Whether there was one. */
export function undo(history: History, diagram: Diagram): boolean {
  const previous = history.past.pop();
  if (previous === undefined) return false;
  history.future.push(history.present);
  return restore(history, diagram, previous);
}

/** Restores the diagram as it was after the last step undone. Whether there was one. */
export function redo(history: History, diagram: Diagram): boolean {
  const next = history.future.pop();
  if (next === undefined) return false;
  history.past.push(history.present);
  return restore(history, diagram, next);
}

/** Gives the diagram the content of a step, without what the step did not hold. */
function restore(history: History, diagram: Diagram, snapshot: Snapshot): true {
  history.present = snapshot;
  const content = JSON.parse(snapshot) as Partial<Diagram>;
  for (const key of Object.keys(diagram) as (keyof Diagram)[]) if (key !== "id" && key !== "updatedAt" && !(key in content)) delete diagram[key];
  Object.assign(diagram, content);
  return true;
}
