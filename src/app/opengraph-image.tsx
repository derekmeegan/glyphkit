import { ImageResponse } from "next/og";
import font from "glyphkit/fonts/familjen-grotesk-700";
import { INK, LETTERS, PAPER, initialComposition, layoutComposition } from "@/components/alphabet/composition";
import { geometryFor } from "@/components/alphabet/drawing";

export const alt = "The alphabet stretched into four rows of bold charcoal letters on a warm white background.";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpenGraphImage() {
  const margin = 36;
  const composition = initialComposition();
  const ratios = Object.fromEntries(LETTERS.map((char) => {
    const [x0, y0, x1, y1] = font.glyphs[char].bbox;
    return [char, (x1 - x0) / (y1 - y0)];
  }));
  const layout = layoutComposition(size.width - margin * 2, size.height - margin * 2, composition, ratios);

  return new ImageResponse(
    <svg xmlns="http://www.w3.org/2000/svg" width={size.width} height={size.height} viewBox={`0 0 ${size.width} ${size.height}`}>
      <rect width={size.width} height={size.height} fill={PAPER} />
      {layout.boxes.map((box) => {
        const geometry = geometryFor(font, box, layout.baseSize, composition[box.char]);
        const [x0, y0, x1, y1] = geometry.bbox;
        const transform = `translate(${margin + box.x} ${margin + box.y}) scale(${box.width / (x1 - x0)} ${box.height / (y1 - y0)}) translate(${-x0} ${-y0})`;
        return <path key={box.char} d={geometry.d} fill={INK} transform={transform} />;
      })}
    </svg>,
    size,
  );
}
