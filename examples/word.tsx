/**
 * A run of letters, each drawn as its own object.
 *
 * Not a text run with letter-spacing: negative tracking packs the letters
 * into each other and both are still fully there where they cross, so the
 * overlap reads as depth rather than as a collision.
 */
import { Word } from "glyphkit";
import spaceGrotesk700 from "glyphkit/fonts/space-grotesk-700";

export function Wordmark() {
  return (
    <Word
      text="GLYPH"
      font={spaceGrotesk700}
      size={120}
      tracking={-0.08}
      // Per-gap multipliers: some pairs interlock further than others.
      kerning={[1, 0.6, 1, 1.2]}
      fill="#22221f"
      // A cut of the ground around each letter, so crossings stay legible.
      halo={0.012}
      haloColor="#f4f3ee"
    />
  );
}
