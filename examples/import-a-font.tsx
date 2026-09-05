/**
 * A font the reader picks, read in their browser.
 *
 * The same extraction the build step runs — so an imported face warps, keeps
 * its stems, and exports exactly like a bundled one. The file never leaves
 * the page: there is no server in this at all.
 */
"use client";

import { useState } from "react";
import { Glyph, type GlyphFont } from "glyphkit";

export function ImportAFont() {
  const [font, setFont] = useState<GlyphFont | null>(null);
  const [problem, setProblem] = useState("");

  async function read(file: File) {
    setProblem("");
    // A quarter of a megabyte of parser, fetched only when it is needed.
    const { extractFont } = await import("glyphkit/extract");
    try {
      const { font, missing } = extractFont(await file.arrayBuffer(), { chars: "ABCG" });
      // Better to say which letters are absent than to draw holes.
      if (missing.length) return setProblem(`That font has no ${missing.join(", ")}.`);
      setFont(font);
    } catch {
      setProblem("Couldn’t read that font. TrueType, OpenType and WOFF work; WOFF2 doesn’t.");
    }
  }

  return (
    <div>
      <input type="file" accept=".ttf,.otf,.woff" onChange={(event) => {
        const file = event.target.files?.[0];
        if (file) read(file);
      }} />
      {problem && <p role="alert">{problem}</p>}
      {font && <Glyph char="G" font={font} size={200} stretch={{ x: 1.4 }} fill="#22221f" title={`G in ${font.name}`} />}
    </div>
  );
}
