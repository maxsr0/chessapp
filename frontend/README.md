# ChessIQ frontend

The Next.js site for ChessIQ. For the overall project, the backend and deployment, see the [root README](../README.md).

> This is Next.js 16. APIs differ from older versions, so read `AGENTS.md` and `node_modules/next/dist/docs/` before changing Next APIs.

## Commands

```bash
npm install
NEXT_PUBLIC_API_URL=http://127.0.0.1:8000 npm run dev   # http://localhost:3000/chessapp
npm run build          # static export to out/
npx tsc --noEmit       # type check
npx eslint src         # lint
```

The site is a static export (`output: "export"`) served under `basePath: /chessapp`. All data is fetched in the browser, so `cacheComponents` and PPR stay off; they don't work with static export. Pages that use query parameters (`/player?u=`, `/game?id=`) read `useSearchParams` inside a `<Suspense>` boundary.

## Design system

- **Type:** Archivo (display), Inter (body), JetBrains Mono (labels), shared with maxwellrobbins.com.
- **Palette:** tokens in `src/app/globals.css`. Dark green felt with a brass accent is the default. Cream light mode is opt-in via `data-theme="light"`, which the header toggle sets and `localStorage` remembers.
- **Charts:** series colors were contrast-checked against both themes. Keep one y-axis per chart, and keep text in ink colors (colored dots carry the meaning).
- **Motion:** shared pieces live in `src/components/motion.tsx`:
  - `Reveal`, a scroll-in fade;
  - `NumberTicker`, count-up numbers;
  - `SpotlightCard`, a cursor glow;
  - `Segmented`, the pill radio group used instead of native `<select>`s.

  Above-the-fold hero text animates with CSS (`.rise`), so it shows before JavaScript loads. Every animation respects `prefers-reduced-motion`.

## The hero king

`src/components/HeroKingScene.tsx` renders the king with react-three-fiber. It's loaded on the client only, through `HeroPiece.tsx`, which shows an SVG silhouette until the model is ready and also when WebGL is unavailable.

- **Model:** `public/models/kings.glb` (about 620 KB) contains the white and black kings from Poly Haven's CC0 “Chess Set”. Dark mode shows the white king and light mode the black one.
- **Staging:** the piece only spins on its vertical axis. The intro dolly, cursor parallax and scroll move the camera, never the piece. The model is measured at load, scaled to a fixed height and set so its lowest point sits exactly on the floor.
- **Grounding:** a light pool plus two radial shadow discs, sized from the measured foot radius. Lighting is a local studio environment (`Lightformer` cards), so there's no HDR download.
- **Performance:** rendering pauses when the hero scrolls out of view. The Draco decoder is disabled because the file uses meshopt, whose decoder is bundled; Draco would load its decoder from a CDN.

### Regenerating the model

```bash
# 1. Download the 1K glTF (chess_set_1k.gltf, chess_set.bin, textures/*.jpg) from
#    https://polyhaven.com/a/chess_set into an empty folder.
# 2. Trim it to the two kings: WebP textures, meshopt compression.
node scripts/prepare-king.mjs <that-folder>
```

The script writes `public/models/kings.glb`, with nodes named `king_white` and `king_black`.
