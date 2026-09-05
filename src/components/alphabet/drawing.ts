import { glyphGeometry, type GlyphFont } from "glyphkit";
import type { LetterBox, LetterSettings } from "./composition";

export function geometryFor(font: GlyphFont, box: LetterBox, baseSize: number, settings: LetterSettings) {
  const data = font.glyphs[box.char];
  const scale = baseSize / font.capHeight;
  return glyphGeometry(font, box.char, {
    stretch: {
      x: box.width / ((data.bbox[2] - data.bbox[0]) * scale),
      y: box.height / ((data.bbox[3] - data.bbox[1]) * scale),
    },
    protectStems: settings.protect,
    smooth: true,
  });
}


export function letterSvg(font: GlyphFont, box: LetterBox, baseSize: number, settings: LetterSettings) {
  const geometry = geometryFor(font, box, baseSize, settings);
  const [x0, y0, x1, y1] = geometry.bbox;
  const padding = 2;
  const width = box.width + padding * 2;
  const height = box.height + padding * 2;
  const transform = `translate(${padding} ${padding}) scale(${box.width / (x1 - x0)} ${box.height / (y1 - y0)}) translate(${-x0} ${-y0})`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><title>${box.char}</title><g transform="${transform}"><path d="${geometry.d}" fill="${settings.outline ? "none" : settings.color}" stroke="${settings.outline ? settings.color : "none"}" stroke-width="1.5" stroke-linejoin="round" vector-effect="non-scaling-stroke"/></g></svg>`;
}
