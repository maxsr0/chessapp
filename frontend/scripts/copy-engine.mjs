// Copies the full single-threaded Stockfish 17.1 WebAssembly build (same NNUE net as the
// server's native 17.1) from node_modules into public/engine/ under stable names. It runs
// before dev and build, so the ~79 MB of wasm never lands in git. The single-threaded
// flavor is the one that runs without cross-origin isolation headers, which GitHub Pages
// can't set. The worker loads "<name>-part-N.wasm" next to its own script, so the parts are
// renamed with it.
import { copyFileSync, mkdirSync, readdirSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const src = join(root, "node_modules", "stockfish", "src");
const out = join(root, "public", "engine");
const NAME = "stockfish-17.1-single";

const files = readdirSync(src).filter((f) => /^stockfish-17\.1-single-[0-9a-f]+(\.js|-part-\d+\.wasm)$/.test(f));
const js = files.find((f) => f.endsWith(".js"));
const parts = files.filter((f) => f.endsWith(".wasm"));
if (!js || parts.length === 0) throw new Error(`Stockfish single-threaded build not found in ${src}`);

rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });
copyFileSync(join(src, js), join(out, `${NAME}.js`));
for (const p of parts) copyFileSync(join(src, p), join(out, `${NAME}-part-${p.match(/-part-(\d+)\.wasm$/)[1]}.wasm`));
copyFileSync(join(root, "node_modules", "stockfish", "Copying.txt"), join(out, "COPYING.txt")); // GPLv3
console.log(`copy-engine: ${NAME}.js + ${parts.length} wasm parts -> public/engine/`);
