// What the Widget shows: the diagrams changed last, and when, as the User reads it ("5 min ago").

import type { DiagramEntry } from "./diagram.ts";
import { t } from "./i18n.ts";

/** How many diagrams the Widget lists: what fits in a cell of size M, of about 336 × 160 px (CONVENTION.md §7.1). */
const SHOWN = 4;

/** The diagrams changed last, the most recent first. */
export function recentDiagrams(index: readonly DiagramEntry[]): DiagramEntry[] {
  return [...index].sort((a, b) => b.updatedAt - a.updatedAt).slice(0, SHOWN);
}

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/** When a diagram changed at `updatedAt` was changed, seen at `now`; a time ahead of `now` is "just now". */
export function relativeTime(updatedAt: number, now: number): string {
  const elapsed = now - updatedAt;
  if (elapsed < MINUTE) return t("changed_now");
  if (elapsed < HOUR) return t("changed_minutes", { count: Math.floor(elapsed / MINUTE) });
  if (elapsed < DAY) return t("changed_hours", { count: Math.floor(elapsed / HOUR) });
  if (elapsed < 2 * DAY) return t("changed_yesterday");
  return t("changed_days", { count: Math.floor(elapsed / DAY) });
}
