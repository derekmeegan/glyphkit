/**
 * A letter as the playground exports it.
 *
 * Drag a letter's edges in the alphabet, then copy React from its editor: the
 * stretch it was dragged to comes across as numbers, so the letter can be set
 * again at any size without a screenshot or a hand-edited path.
 */
import { Glyph } from "glyphkit";
import familjenGrotesk700 from "glyphkit/fonts/familjen-grotesk-700";

export function LetterG() {
  return (
    <Glyph
      char="G"
      font={familjenGrotesk700}
      size={160}
      // 1.44x the width it was drawn at, and a hair shorter.
      stretch={{ x: 1.442, y: 0.965 }}
      protectStems
      smooth
      fill="#22221f"
    />
  );
}
