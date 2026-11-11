// One-time asset prep for the home-page hero: pull the two kings out of Poly Haven's
// "Chess Set" (Riley Queen, CC0, https://polyhaven.com/a/chess_set) into one small GLB.
//
// Usage: download the 1K glTF (chess_set_1k.gltf, chess_set.bin, textures/*.jpg) into an
// empty folder, then from frontend/:
//   node scripts/prepare-king.mjs <folder>
// Writes public/models/kings.glb with nodes "king_white" and "king_black".

import path from "node:path";
import { NodeIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
import { dedup, meshopt, prune, textureCompress } from "@gltf-transform/functions";
import { MeshoptEncoder } from "meshoptimizer";
import sharp from "sharp";

const src = process.argv[2];
if (!src) {
  console.error("usage: node scripts/prepare-king.mjs <folder with chess_set_1k.gltf>");
  process.exit(1);
}
const out = path.resolve(import.meta.dirname, "../public/models/kings.glb");
const KEEP = { piece_king_white: "king_white", piece_king_black: "king_black" };

await MeshoptEncoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ "meshopt.encoder": MeshoptEncoder });
const doc = await io.read(path.join(src, "chess_set_1k.gltf"));
const root = doc.getRoot();

for (const node of root.listNodes()) {
  const rename = KEEP[node.getName()];
  if (!rename) {
    node.dispose();
    continue;
  }
  node.setName(rename);
  node.setTranslation([0, 0, 0]); // the scene grounds and places the piece itself
}

await doc.transform(
  prune(), // drops the board, other pieces, and their materials/textures
  dedup(),
  textureCompress({ encoder: sharp, targetFormat: "webp", resize: [1024, 1024], quality: 82 }),
  meshopt({ encoder: MeshoptEncoder, level: "medium" }),
);

await io.write(out, doc);
const kept = root.listNodes().map((n) => n.getName());
const tex = root.listTextures().map((t) => `${t.getName() || t.getURI()} ${t.getSize()?.join("x")}`);
console.log("wrote", out, { nodes: kept, textures: tex });
