/**
 * The same stretch, twice, with the stems protected and then let go.
 *
 * `protectStems` is what separates a wide letter from a smeared one: on, ink
 * runs about a stem wide keep their width while the bars between them carry
 * the stretch; off, this degrades to the anisotropic scale you already know.
 */
import { Glyph } from "glyphkit";
import bodoniModa500 from "glyphkit/fonts/bodoni-moda-500";

export function OutlinedLetter() {
  return (
    <div style={{ display: "flex", gap: 24, background: "#f4f3ee" }}>
      <Glyph char="R" font={bodoniModa500} size={180} stretch={{ x: 1.8 }}
        // strokeWidth is in em units, so the outline scales with the letter.
        fill="none" stroke="#e8492d" strokeWidth={0.008} title="R, stems held" />
      <Glyph char="R" font={bodoniModa500} size={180} stretch={{ x: 1.8 }} protectStems={false}
        fill="none" stroke="#adada5" strokeWidth={0.008} title="R, stems stretched" />
    </div>
  );
}
