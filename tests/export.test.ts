import assert from "node:assert/strict";
import test from "node:test";
import font from "glyphkit/fonts/familjen-grotesk-700";
import { defaults } from "../src/components/alphabet/composition";
import { geometryFor, letterReactCode, letterSvg } from "../src/components/alphabet/drawing";

test("SVG export uses the displayed geometry and adds room for its outline", () => {
  const box = { char: "B", x: 120, y: 60, width: 240, height: 180 };
  const settings = { ...defaults(), color: "#3159d8", outline: true };
  const geometry = geometryFor(font, box, 180, settings);
  const svg = letterSvg(font, box, 180, settings);
  assert.ok(svg.includes('viewBox="0 0 244 184"'));
  assert.ok(svg.includes(`d="${geometry.d}"`));
  assert.ok(svg.includes('fill="none" stroke="#3159d8"'));
  assert.ok(svg.includes('vector-effect="non-scaling-stroke"'));
  assert.ok(!svg.includes("NaN") && !svg.includes("Infinity"));
});

test("React export carries the letter's stretch, font module and ink", () => {
  const box = { char: "B", x: 120, y: 60, width: 240, height: 180 };
  const code = letterReactCode(font, box, 180, { ...defaults(), color: "#3159d8" }, { family: "Space Grotesk", weight: 500 });
  assert.ok(code.includes('import { Glyph } from "glyphkit";'));
  assert.ok(code.includes('import spaceGrotesk500 from "glyphkit/fonts/space-grotesk-500";'));
  assert.ok(code.includes("export function LetterB() {"));
  assert.ok(code.includes('char="B"'));
  assert.ok(code.includes("font={spaceGrotesk500}"));
  assert.ok(code.includes("size={180}"));
  assert.ok(code.includes("protectStems\n"));
  assert.ok(code.includes('fill="#3159d8"'));
  assert.ok(!code.includes("NaN") && !code.includes("Infinity") && !code.includes("undefined"));
});

test("React export mirrors the outline appearance and the loose stem setting", () => {
  const box = { char: "Q", x: 0, y: 0, width: 300, height: 150 };
  const code = letterReactCode(font, box, 180, { ...defaults(), color: "#e8492d", outline: true, protect: false }, { family: "Familjen Grotesk", weight: 700 });
  assert.ok(code.includes("protectStems={false}"));
  assert.ok(code.includes('fill="none"'));
  assert.ok(code.includes('stroke="#e8492d"'));
  assert.match(code, /strokeWidth=\{0\.\d+\}/);
});

test("React export tells you an imported face still needs extracting", () => {
  const box = { char: "A", x: 0, y: 0, width: 200, height: 200 };
  const code = letterReactCode(font, box, 180, defaults(), { family: "Playfair Display Bold", weight: 700 });
  assert.ok(code.includes("node scripts/extract.mjs --font <file> --out fonts/playfair-display-bold.json"));
  assert.ok(code.includes('import playfairDisplayBold from "glyphkit/fonts/playfair-display-bold";'));
  assert.ok(code.includes("font={playfairDisplayBold}"));
});
