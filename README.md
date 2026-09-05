# glyphkit

Stretch and style letterforms in the browser.

The alphabet fills the page. Drag a letter's edges to change its proportions, or click it to edit its size, color, and outline. Choose a typeface and weight, then export individual letters as SVG or as a `<Glyph>` component.

Glyphkit works with font outlines, so the result is a set of paths you can use in a design or another application. The same geometry is available as a small React library.

## Controls

- **Drag an edge or corner** to resize a letter. The surrounding letters make room.
- **Click a letter** to open its controls, download its SVG, or copy it as a React component.
- **Change typeface or weight** in the footer. This applies to the alphabet and keeps your individual letter edits.
- **Import a font** with the button beside them — TrueType, OpenType or WOFF. The file is read in your browser and never uploaded; it lasts for the page session.
- **Arrow keys** resize the focused letter. Hold Shift for larger steps.
- **Escape** closes the editor or cancels a drag.

Includes Familjen Grotesk, Space Grotesk, and Bodoni Moda, each at weights 400–700, plus any font you import. Edits stay in the current page session; reloading resets them.

## Run locally

Requires Node.js 22+ and pnpm 11.

```sh
pnpm install
pnpm dev
```

Open [localhost:3000](http://localhost:3000). `pnpm build` builds the application; `pnpm start` serves that build.

```sh
pnpm test
pnpm lint
pnpm typecheck
```

## Library

The playground lives in `src/`. The outline extraction, stretching, and React components live in [`packages/glyphkit`](packages/glyphkit).

[`examples/`](examples) has a quickstart and a handful of runnable components, including the one the letter editor copies. Any TrueType, OpenType or WOFF file can be brought in as a face, either through the playground's import button or as a module — see [bringing your own font](examples/README.md#bringing-your-own-font).

Stretching approximates a width or height change; it is not a typeface designer's variable-font axis. Curves and diagonals can change weight. Exports are SVG paths, not installable font files.

## License

Code: [MIT](LICENSE). The bundled fonts retain their [SIL Open Font Licenses](packages/glyphkit/fonts/licenses). See [third-party notices](THIRD_PARTY_NOTICES.md).
