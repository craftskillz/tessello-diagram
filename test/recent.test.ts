import assert from "node:assert/strict";
import { afterEach, describe, test } from "node:test";
import { setLocale } from "../src/lib/i18n.ts";
import { recentDiagrams, relativeTime } from "../src/lib/recent.ts";

describe("the diagrams the Widget lists", () => {
  test("the four changed last, the most recent first", () => {
    const index = [
      { id: "a", title: "A", updatedAt: 30 },
      { id: "b", title: "B", updatedAt: 50 },
      { id: "c", title: "C", updatedAt: 10 },
      { id: "d", title: "D", updatedAt: 40 },
      { id: "e", title: "E", updatedAt: 20 },
    ];
    assert.deepEqual(
      recentDiagrams(index).map((entry) => entry.id),
      ["b", "d", "a", "e"],
    );
  });

  test("fewer diagrams are all listed, and none is an empty list", () => {
    assert.deepEqual(recentDiagrams([{ id: "a", title: "A", updatedAt: 1 }]), [{ id: "a", title: "A", updatedAt: 1 }]);
    assert.deepEqual(recentDiagrams([]), []);
  });
});

describe("when a diagram was changed, as the Widget says it", () => {
  const MIN = 60_000;
  const HOUR = 60 * MIN;
  const DAY = 24 * HOUR;
  const now = 1_000 * DAY;
  afterEach(() => setLocale("en"));

  test("in English, from just now to days ago", () => {
    assert.equal(relativeTime(now - 20_000, now), "just now");
    assert.equal(relativeTime(now - 5 * MIN, now), "5 min ago");
    assert.equal(relativeTime(now - 3 * HOUR - 10 * MIN, now), "3 h ago");
    assert.equal(relativeTime(now - 30 * HOUR, now), "yesterday");
    assert.equal(relativeTime(now - 9 * DAY, now), "9 days ago");
  });

  test("in French", () => {
    setLocale("fr-FR");
    assert.equal(relativeTime(now - 20_000, now), "à l'instant");
    assert.equal(relativeTime(now - 5 * MIN, now), "il y a 5 min");
    assert.equal(relativeTime(now - 3 * HOUR, now), "il y a 3 h");
    assert.equal(relativeTime(now - 30 * HOUR, now), "hier");
    assert.equal(relativeTime(now - 9 * DAY, now), "il y a 9 jours");
  });

  test("a date in the future, from a clock set differently, is just now", () => {
    assert.equal(relativeTime(now + 5 * MIN, now), "just now");
  });
});
