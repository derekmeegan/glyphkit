import assert from "node:assert/strict";
import test from "node:test";
import font from "glyphkit/fonts/familjen-grotesk-700";
import { defaults } from "../src/components/alphabet/composition";
import { geometryFor, letterSvg } from "../src/components/alphabet/drawing";

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
