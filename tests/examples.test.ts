import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import font from "glyphkit/fonts/familjen-grotesk-700";
import { Quickstart } from "../examples/quickstart";
import { LetterG } from "../examples/stretched-letter";
import { OutlinedLetter } from "../examples/outlined-letter";
import { Wordmark } from "../examples/word";
import { Initial } from "../examples/your-own-font";
import { ImportAFont } from "../examples/import-a-font";

/** The examples are the documentation, so they have to draw something. */
const cases = [
  ["quickstart", createElement(Quickstart)],
  ["stretched-letter", createElement(LetterG)],
  ["outlined-letter", createElement(OutlinedLetter)],
  ["word", createElement(Wordmark)],
  ["your-own-font", createElement(Initial, { font, char: "D" })],
] as const;

for (const [name, element] of cases) {
  test(`example ${name} renders real path data`, () => {
    const markup = renderToStaticMarkup(element);
    assert.match(markup, /<path [^>]*d="M[^"]{40,}"/);
    assert.ok(!markup.includes("NaN") && !markup.includes("Infinity"));
  });
}

/** This one draws nothing until a file arrives, so it is checked differently. */
test("example import-a-font renders its picker before any font is chosen", () => {
  const markup = renderToStaticMarkup(createElement(ImportAFont));
  assert.match(markup, /<input type="file"[^>]*accept="\.ttf,\.otf,\.woff"/);
  assert.ok(!markup.includes("<path"), "nothing is drawn until a font is read");
});
