import assert from "node:assert/strict";
import test from "node:test";
import font from "glyphkit/fonts/familjen-grotesk-700";
import { LETTERS, MAX_SCALE, MIN_SCALE, initialComposition, layoutComposition, resizeLetter } from "../src/components/alphabet/composition";

const ratios = Object.fromEntries(LETTERS.map((char) => {
  const [x0, y0, x1, y1] = font.glyphs[char].bbox;
  return [char, (x1 - x0) / (y1 - y0)];
}));
const viewports = [[292, 424], [362, 718], [778, 735], [1400, 777], [984, 645]];

test("the complete alphabet stays in bounds, including after uneven edits", () => {
  for (const [width, height] of viewports) for (const varied of [false, true]) {
    const composition = initialComposition();
    if (varied) LETTERS.forEach((char, i) => Object.assign(composition[char], { x: .4 + (i % 9) * .3, y: .4 + (i % 7) * .4 }));
    const layout = layoutComposition(width, height, composition, ratios);
    assert.equal(layout.boxes.length, 26);
    assert.equal(new Set(layout.boxes.map((box) => box.char)).size, 26);
    for (const box of layout.boxes) {
      assert.ok(box.width > 0 && box.height > 0);
      assert.ok(box.x >= -1e-8 && box.y >= -1e-8);
      assert.ok(box.x + box.width <= width + 1e-8);
      assert.ok(box.y + box.height <= height + 1e-8);
    }
  }
});

test("dragging maps pixel deltas back to independent letter dimensions", () => {
  for (const [width, height] of viewports) {
    const composition = initialComposition();
    const layout = layoutComposition(width, height, composition, ratios);
    for (const box of layout.boxes) for (const scale of [.85, 1, 1.15]) {
      const patch = resizeLetter(box.char, box.width * scale, box.height * scale, layout, composition, ratios);
      const changed = { ...composition, [box.char]: { ...composition[box.char], ...patch } };
      const after = layoutComposition(width, height, changed, ratios).boxes.find((next) => next.char === box.char)!;
      assert.ok(Math.abs(after.width - box.width * scale) < 1e-6);
      assert.ok(Math.abs(after.height - box.height * scale) < 1e-6);
      for (const char of LETTERS) if (char !== box.char) assert.equal(changed[char], composition[char]);
    }
  }
});

test("dragging beyond the canvas clamps both dimensions", () => {
  const composition = initialComposition();
  const layout = layoutComposition(1000, 700, composition, ratios);
  assert.deepEqual(resizeLetter("A", -10000, -10000, layout, composition, ratios), { x: MIN_SCALE, y: MIN_SCALE });
  assert.deepEqual(resizeLetter("A", 10000, 10000, layout, composition, ratios), { x: MAX_SCALE, y: MAX_SCALE });
});
