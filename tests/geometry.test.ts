import assert from "node:assert/strict";
import test from "node:test";
import { glyphGeometry } from "../packages/glyphkit/src/outline";
import type { Contour } from "../packages/glyphkit/src/types";
import font from "glyphkit/fonts/familjen-grotesk-700";
import { LETTERS } from "../src/components/alphabet/composition";
import { FAMILIES, WEIGHTS, loadTypeface } from "../src/components/alphabet/typefaces";

const area = (contour: Contour) => contour.reduce((sum, [x, y], i) => {
  const next = contour[(i + 1) % contour.length];
  return sum + x * next[1] - next[0] * y;
}, 0);

test("smooth stretching preserves bounds, contour winding, and finite geometry", () => {
  for (const char of LETTERS) for (const x of [.4, 1, 3]) for (const y of [.4, 1, 3]) {
    const geometry = glyphGeometry(font, char, { stretch: { x, y }, smooth: true });
    const original = font.glyphs[char];
    assert.ok(Math.abs((geometry.bbox[2] - geometry.bbox[0]) / (original.bbox[2] - original.bbox[0]) - x) < .0001);
    assert.ok(Math.abs((geometry.bbox[3] - geometry.bbox[1]) / (original.bbox[3] - original.bbox[1]) - y) < .0001);
    assert.equal(geometry.contours.length, original.contours.length);
    geometry.contours.forEach((contour, i) => {
      assert.equal(Math.sign(area(contour)), Math.sign(area(original.contours[i])));
      contour.forEach((point) => point.forEach((value) => assert.ok(Number.isFinite(value))));
    });
  }
});

test("every selectable family and weight contains distinct A–Z outlines", async () => {
  const signatures = new Set<string>();
  for (const family of FAMILIES) for (const weight of WEIGHTS) {
    const face = await loadTypeface({ family, weight });
    assert.ok(face.capHeight > 0 && face.stemWidth > 0);
    for (const char of LETTERS) {
      assert.ok(face.glyphs[char]?.contours.length > 0);
      const geometry = glyphGeometry(face, char, { stretch: { x: 1.5, y: .8 }, smooth: true });
      assert.ok(geometry.d.length > 0 && !geometry.missing);
    }
    const signature = JSON.stringify(face.glyphs);
    assert.ok(!signatures.has(signature), `${family} ${weight} repeats another font's geometry`);
    signatures.add(signature);
  }
  assert.equal(signatures.size, 12);
});
