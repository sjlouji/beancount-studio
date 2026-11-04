import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { parseBounds, restorableBounds, type Bounds } from "./window-bounds";

const laptop: Bounds = { x: 0, y: 25, width: 1512, height: 920 };
const external: Bounds = { x: 1512, y: 0, width: 2560, height: 1415 };
const minimum = { width: 960, height: 640 };

describe("parseBounds", () => {
  it("accepts four finite numbers", () => {
    assert.deepEqual(parseBounds({ x: 10, y: 20, width: 1200, height: 800 }), { x: 10, y: 20, width: 1200, height: 800 });
  });

  it("rounds fractional values", () => {
    assert.deepEqual(parseBounds({ x: 10.4, y: 20.6, width: 1200.5, height: 800 }), { x: 10, y: 21, width: 1201, height: 800 });
  });

  it("rejects anything else", () => {
    assert.equal(parseBounds(undefined), undefined);
    assert.equal(parseBounds(null), undefined);
    assert.equal(parseBounds("1200x800"), undefined);
    assert.equal(parseBounds({ x: 0, y: 0, width: 1200 }), undefined);
    assert.equal(parseBounds({ x: 0, y: 0, width: Number.NaN, height: 800 }), undefined);
    assert.equal(parseBounds({ x: 0, y: 0, width: -5, height: 800 }), undefined);
  });
});

describe("restorableBounds", () => {
  it("keeps a window that sits on a display", () => {
    const saved = { x: 100, y: 80, width: 1280, height: 820 };
    assert.deepEqual(restorableBounds(saved, [laptop], minimum), saved);
  });

  it("keeps a window on a second display", () => {
    const saved = { x: 2000, y: 200, width: 1400, height: 900 };
    assert.deepEqual(restorableBounds(saved, [laptop, external], minimum), saved);
  });

  it("drops a window whose display is gone", () => {
    const saved = { x: 2000, y: 200, width: 1400, height: 900 };
    assert.equal(restorableBounds(saved, [laptop], minimum), undefined);
  });

  it("drops a window whose title bar is off screen even though its body overlaps", () => {
    const saved = { x: 100, y: -700, width: 1280, height: 820 };
    assert.equal(restorableBounds(saved, [laptop], minimum), undefined);
  });

  it("grows a window smaller than the minimum", () => {
    assert.deepEqual(restorableBounds({ x: 100, y: 80, width: 400, height: 300 }, [laptop], minimum), {
      x: 100,
      y: 80,
      width: 960,
      height: 640,
    });
  });

  it("returns nothing when nothing was saved", () => {
    assert.equal(restorableBounds(undefined, [laptop], minimum), undefined);
  });
});
