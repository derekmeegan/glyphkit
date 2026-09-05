import assert from "node:assert/strict";
import test from "node:test";
import opentype from "opentype.js";
import { extractFont, measureStemWidth } from "glyphkit/extract";
import familjen700 from "glyphkit/fonts/familjen-grotesk-700";
import familjen400 from "glyphkit/fonts/familjen-grotesk-400";
import spaceGrotesk700 from "glyphkit/fonts/space-grotesk-700";
import bodoni700 from "glyphkit/fonts/bodoni-moda-700";

/** A face with one letter in it: an I, drawn as a 120-unit stem 700 tall. */
function stemFont({ unitsPerEm = 1000, stem = 120 } = {}) {
  const path = new opentype.Path();
  path.moveTo(80, 0);
  path.lineTo(80 + stem, 0);
  path.lineTo(80 + stem, 700);
  path.lineTo(80, 700);
  path.close();
  const glyphs = [
    new opentype.Glyph({ name: ".notdef", unicode: 0, advanceWidth: 400, path: new opentype.Path() }),
    new opentype.Glyph({ name: "I", unicode: 73, advanceWidth: stem + 160, path }),
  ];
  return new opentype.Font({
    familyName: "Test Face", styleName: "Regular", unitsPerEm, ascender: 800, descender: -200, glyphs,
  }).toArrayBuffer();
}

test("extraction reads outlines, metrics and side bearings out of font bytes", () => {
  const { font, missing } = extractFont(stemFont(), { chars: "IX" });
  assert.equal(font.em, 1000);
  assert.deepEqual(missing, ["X"], "a character the font has no glyph for is reported, not invented");

  const I = font.glyphs.I;
  assert.equal(I.advance, 280);
  assert.equal(I.lsb, 80);
  assert.equal(I.rsb, 80);
  // y-down with the baseline at 0, so the cap sits at negative y.
  assert.deepEqual(I.bbox, [80, -700, 200, 0]);
  assert.equal(I.contours.length, 1);
  assert.equal(I.contours[0].length, 4, "a rectangle simplifies back to its corners");
  assert.equal(font.stemWidth, 120);
});

test("extraction normalises any em size to a 1000-unit box", () => {
  const { font } = extractFont(stemFont({ unitsPerEm: 2048, stem: 246 }), { chars: "I" });
  assert.equal(font.em, 1000);
  // 246/2048 em is the same stem as 120/1000, to within the rounding.
  assert.ok(Math.abs(font.stemWidth - 120) <= 1, `stem ${font.stemWidth}`);
  assert.ok(Math.abs(font.glyphs.I.bbox[1] + 342) <= 1, "the cap scales with the em box");
});

test("the stem estimate recovers the weight every bundled face was built with", () => {
  for (const font of [familjen400, familjen700, spaceGrotesk700, bodoni700]) {
    const measured = measureStemWidth(font.glyphs);
    assert.ok(Math.abs(measured - font.stemWidth) / font.stemWidth < 0.02,
      `${font.name}: measured ${measured}, built with ${font.stemWidth}`);
  }
});

test("bytes that are not a font are rejected rather than half-read", () => {
  assert.throws(() => extractFont(new TextEncoder().encode("not a font at all").buffer));
});
