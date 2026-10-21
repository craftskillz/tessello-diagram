import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { entryBytes, QUOTA, storageUsage, usageText } from "../src/lib/usage.ts";

describe("storage usage", () => {
  test("an entry counts the UTF-8 bytes of its key and of its value as JSON", () => {
    // "é" is 2 bytes; the value "é" is 4 bytes once serialized, with its quotes.
    assert.equal(entryBytes("clé", "é"), 4 + 4);
    assert.equal(entryBytes("diagrams", [{ id: "a" }]), 8 + 12);
  });

  test("the usage is the sum of the entries, and follows each write and deletion", () => {
    const usage = storageUsage();
    usage.reset(new Map<string, unknown>([["a", 1], ["bb", "x"]]));
    assert.equal(usage.total(), 1 + 1 + 2 + 3);
    usage.set("a", 123);
    assert.equal(usage.total(), 1 + 3 + 2 + 3);
    usage.delete("bb");
    assert.equal(usage.total(), 4);
    assert.equal(usage.has("a"), true);
    assert.equal(usage.has("bb"), false);
  });

  test("a write fits when the total stays within 5 MB, its key's old value no longer counted", () => {
    const usage = storageUsage();
    const big = "x".repeat(QUOTA - 10);
    usage.reset(new Map([["k", big]]));
    assert.equal(usage.fits("other", "abcdefgh"), false);
    assert.equal(usage.fits("o", "abc"), true);
    assert.equal(usage.fits("k", "small"), true);
    // Room kept for what the write brings with it, such as the shapes of an image in their diagram.
    assert.equal(usage.fits("o", "abc", 10), false);
  });

  test("the gauge reads in megabytes out of 5, and alerts past 80%", () => {
    assert.deepEqual(usageText(0), { text: "0.0 MB / 5 MB", alert: false });
    assert.deepEqual(usageText(1.25 * 1024 * 1024), { text: "1.3 MB / 5 MB", alert: false });
    assert.deepEqual(usageText(4 * 1024 * 1024), { text: "4.0 MB / 5 MB", alert: false });
    assert.deepEqual(usageText(4 * 1024 * 1024 + 1), { text: "4.0 MB / 5 MB", alert: true });
  });
});
