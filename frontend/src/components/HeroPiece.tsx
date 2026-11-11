"use client";

import clsx from "clsx";
import dynamic from "next/dynamic";
import { useCallback, useState, useSyncExternalStore } from "react";

/**
 * Flat king silhouette, placed where the 3D king will stand. Shown in the static HTML,
 * while three.js and the model load, and for good when WebGL is unavailable.
 */
function KingSilhouette({ hidden }: { hidden?: boolean }) {
  return (
    <svg
      viewBox="0 0 100 160"
      aria-hidden
      className={clsx(
        "absolute bottom-[14%] left-1/2 lg:left-[70%] -translate-x-1/2 h-[73%] w-auto aspect-[100/160] text-ink/[0.06] transition-opacity duration-700",
        hidden && "opacity-0",
      )}
    >
      <path
        fill="currentColor"
        d="M47 2h6v8h8v6h-8v6a5 5 0 0 1 2 4c6 1 9 3 12 5l-6 22h-4c2 3 3 4 1 6h-4l1 30c3 4 8 8 13 11 1 2 0 3-1 4 2 1 2 3 1 5 3 1 4 3 3 5H17c-1-2 0-4 3-5-1-2-1-4 1-5-1-1-2-2-1-4 5-3 10-7 13-11l1-30h-4c-2-2-1-3 1-6h-4l-6-22c3-2 6-4 12-5a5 5 0 0 1 2-4v-6h-8v-6h8z"
      />
    </svg>
  );
}

const Scene = dynamic(() => import("./HeroKingScene"), { ssr: false, loading: () => null });

let webglCache: boolean | undefined;
function hasWebGL() {
  if (webglCache === undefined) {
    try {
      const c = document.createElement("canvas");
      webglCache = !!(c.getContext("webgl2") || c.getContext("webgl"));
    } catch {
      webglCache = false;
    }
  }
  return webglCache;
}
const noop = () => () => {};

export function HeroPiece({ className }: { className?: string }) {
  // false on the server and during hydration, so the static HTML is the silhouette.
  const webgl = useSyncExternalStore(noop, hasWebGL, () => false);
  const [ready, setReady] = useState(false);
  const onReady = useCallback(() => setReady(true), []);
  return (
    <div className={className}>
      <div className="hero-spot" aria-hidden />
      <KingSilhouette hidden={ready} />
      {webgl && (
        <div className={clsx("absolute inset-0 transition-opacity duration-1000", ready ? "opacity-100" : "opacity-0")}>
          <Scene onReady={onReady} />
        </div>
      )}
    </div>
  );
}
