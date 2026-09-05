/**
 * One letter, drawn.
 *
 * The face is imported like any other module — no web font, no FOUT — and the
 * result is an `<svg>` holding a single `<path>`.
 */
import { Glyph } from "glyphkit";
import familjenGrotesk700 from "glyphkit/fonts/familjen-grotesk-700";

export function Quickstart() {
  // `size` is the cap height in px: the one number that sets how big it is.
  return <Glyph char="G" font={familjenGrotesk700} size={240} fill="#22221f" title="G" />;
}
