"use client";

import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Environment, Lightformer, useGLTF } from "@react-three/drei";
import * as THREE from "three";
import { asset } from "@/lib/paths";

/*
 * Product-shot staging: the piece stands still on the floor and only turns on its own
 * vertical axis. Everything that moves for effect (intro, cursor parallax, scroll) moves
 * the camera, so the base can never dip below the ground.
 *
 * Model: Poly Haven "Chess Set" by Riley Queen (CC0), trimmed to the two kings by
 * scripts/prepare-king.mjs.
 */

const MODEL = asset("/models/kings.glb");
// Draco off: this file uses meshopt (decoder bundled), and Draco would fetch a decoder from a CDN.
useGLTF.preload(MODEL, false, true);

const FLOOR_Y = -1.6;
const KING_HEIGHT = 4.1;
const LOOK_Y = 0.35;
const CAM = new THREE.Vector3(0, 0.9, 11.5);
const INTRO_SECONDS = 1.6;
const INTRO_PULLBACK = 2.2;

type Palette = { light: boolean; accent: string };

function readPalette(): Palette {
  const s = getComputedStyle(document.documentElement);
  return {
    light: document.documentElement.getAttribute("data-theme") === "light",
    accent: s.getPropertyValue("--accent").trim() || "#d4a64a",
  };
}

function usePalette() {
  const [p, setP] = useState(readPalette);
  useEffect(() => {
    const obs = new MutationObserver(() => setP(readPalette()));
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    return () => obs.disconnect();
  }, []);
  return p;
}

/**
 * The king for the current theme, scaled to KING_HEIGHT and measured so its lowest point sits
 * exactly on y = 0 and it is centered on the spin axis. Also returns the foot's radius.
 */
function useKingPiece(light: boolean) {
  const { nodes } = useGLTF(MODEL, false, true) as unknown as { nodes: Record<string, THREE.Object3D> };
  return useMemo(() => {
    const obj = nodes[light ? "king_black" : "king_white"].clone(true);
    obj.position.set(0, 0, 0);
    const size = new THREE.Box3().setFromObject(obj).getSize(new THREE.Vector3());
    obj.scale.multiplyScalar(KING_HEIGHT / size.y);
    const box = new THREE.Box3().setFromObject(obj);
    const c = box.getCenter(new THREE.Vector3());
    obj.position.set(-c.x, -box.min.y, -c.z);
    obj.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh) (m.material as THREE.MeshStandardMaterial).envMapIntensity = light ? 1.4 : 1.15;
    });
    // the foot is the widest part of a king
    const radius = Math.max(box.max.x - box.min.x, box.max.z - box.min.z) / 2;
    return { piece: obj, radius };
  }, [nodes, light]);
}

/** Turns slowly on its own vertical axis only, so the foot never leaves the floor. */
function King({ piece, reduced, onReady }: { piece: THREE.Object3D; reduced: boolean; onReady: () => void }) {
  const spin = useRef<THREE.Group>(null);
  useEffect(onReady, [onReady]);
  useFrame((_, dt) => {
    if (!reduced && spin.current) spin.current.rotation.y += Math.min(dt, 1 / 30) * 0.18;
  });
  return (
    <group ref={spin} rotation={[0, 0.5, 0]}>
      <primitive object={piece} />
    </group>
  );
}

/** Intro dolly, cursor parallax and scroll rise, all applied to the camera. */
function CameraRig({ reduced, target }: { reduced: boolean; target: THREE.Vector3 }) {
  useFrame(({ camera, clock, pointer }, rawDt) => {
    const dt = Math.min(rawDt, 1 / 30);
    const t = reduced ? 1 : Math.min(1, clock.elapsedTime / INTRO_SECONDS); // wall-clock, never stalls
    const e = 1 - Math.pow(1 - t, 3);
    const scroll = reduced ? 0 : Math.min(window.scrollY, 800);
    const px = reduced ? 0 : pointer.x;
    const py = reduced ? 0 : pointer.y;
    camera.position.set(
      THREE.MathUtils.damp(camera.position.x, CAM.x + px * 0.7, 2.5, dt),
      THREE.MathUtils.damp(camera.position.y, CAM.y + py * 0.35 + scroll * 0.0012, 2.5, dt),
      CAM.z + (1 - e) * INTRO_PULLBACK,
    );
    camera.lookAt(target);
  });
  return null;
}

/** A radial gradient texture: opaque at the center, fading to clear at `fade` (0..1 of the radius). */
function useRadialTexture(core: number, fade = 1) {
  const tex = useMemo(() => {
    const c = document.createElement("canvas");
    c.width = c.height = 256;
    const ctx = c.getContext("2d")!;
    const g = ctx.createRadialGradient(128, 128, 0, 128, 128, 128);
    g.addColorStop(0, "rgba(255,255,255,1)");
    g.addColorStop(core, "rgba(255,255,255,0.85)");
    g.addColorStop(fade, "rgba(255,255,255,0)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 256, 256);
    return new THREE.CanvasTexture(c);
  }, [core, fade]);
  useEffect(() => () => tex.dispose(), [tex]);
  return tex;
}

/** A flat disc on the floor, used for the light pool and the shadows. Drawn in `order`. */
function FloorDisc({
  radius,
  color,
  opacity,
  core,
  order,
}: {
  radius: number;
  color: string;
  opacity: number;
  core: number;
  order: number;
}) {
  const map = useRadialTexture(core);
  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.001 * (order + 2), 0]} renderOrder={order}>
      <planeGeometry args={[radius * 2, radius * 2]} />
      <meshBasicMaterial map={map} color={color} transparent opacity={opacity} depthWrite={false} toneMapped={false} />
    </mesh>
  );
}

/** Wide screens: the piece sits right of the copy. Narrow: centered. */
function Stage({ palette, reduced, onReady }: { palette: Palette; reduced: boolean; onReady: () => void }) {
  const { viewport, size } = useThree();
  const x = size.width / size.height > 1.15 ? viewport.width * 0.2 : 0;
  const target = useMemo(() => new THREE.Vector3(x * 0.35, LOOK_Y, 0), [x]);
  const { piece, radius } = useKingPiece(palette.light);
  const shadow = palette.light ? "#2e2516" : "#000000";
  return (
    <>
      <CameraRig reduced={reduced} target={target} />
      <group position={[x, FLOOR_Y, 0]}>
        <King piece={piece} reduced={reduced} onReady={onReady} />
        {/* Light pool so the shadow has a surface to land on, then a soft shadow falloff and a
            tight dark ring where the foot meets the floor. A king's foot is round, so radial
            discs sized from the measured foot are exact, and they have no edges to show. */}
        <FloorDisc radius={radius * 3.4} color={palette.light ? "#fffaf0" : palette.accent} opacity={palette.light ? 0.75 : 0.3} core={0.25} order={-3} />
        <FloorDisc radius={radius * 2.1} color={shadow} opacity={palette.light ? 0.28 : 0.55} core={0.35} order={-2} />
        <FloorDisc radius={radius * 1.18} color={shadow} opacity={palette.light ? 0.45 : 0.75} core={0.7} order={-1} />
      </group>
    </>
  );
}

/** Pause rendering while the hero is scrolled out of view. */
function useInView(ref: React.RefObject<HTMLElement | null>) {
  const [inView, setInView] = useState(true);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(([e]) => setInView(e.isIntersecting));
    io.observe(el);
    return () => io.disconnect();
  }, [ref]);
  return inView;
}

export default function HeroKingScene({ onReady }: { onReady: () => void }) {
  const palette = usePalette();
  const [reduced] = useState(() => window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  const wrap = useRef<HTMLDivElement>(null);
  const inView = useInView(wrap);

  return (
    <div ref={wrap} className="absolute inset-0">
      <Canvas
        dpr={[1, 2]}
        frameloop={!inView ? "never" : reduced ? "demand" : "always"}
        camera={{ position: [CAM.x, CAM.y, CAM.z + (reduced ? 0 : INTRO_PULLBACK)], fov: 28 }}
        gl={{ antialias: true, alpha: true, toneMapping: THREE.ACESFilmicToneMapping, toneMappingExposure: palette.light ? 1.0 : 1.1 }}
        resize={{ debounce: 0 }}
        aria-hidden
      >
        <ambientLight intensity={0.1} />
        <spotLight position={[-3, 8, 5]} angle={0.32} penumbra={1} intensity={palette.light ? 50 : 80} />
        {/* brass kicker from behind */}
        <spotLight position={[3, 4, -5]} angle={0.5} penumbra={1} intensity={90} color={palette.accent} />
        <Suspense fallback={null}>
          <Stage palette={palette} reduced={reduced} onReady={onReady} />
        </Suspense>
        {/* studio environment from glowing cards (no HDR download); tall strips give the long
            vertical highlights that make a turned, lacquered piece read as polished */}
        <Environment resolution={512} frames={1}>
          <Lightformer form="rect" intensity={4} position={[-4, 1, 3]} rotation-y={Math.PI / 3} scale={[0.6, 9, 1]} />
          <Lightformer form="rect" intensity={2.5} position={[4.5, 1, 2]} rotation-y={-Math.PI / 3} scale={[0.4, 9, 1]} />
          <Lightformer form="rect" intensity={1.6} position={[0, 6, 0]} rotation-x={Math.PI / 2} scale={[6, 6, 1]} />
          <Lightformer form="rect" intensity={1} position={[0, 3, 8]} scale={[8, 2, 1]} />
          <Lightformer form="ring" color={palette.accent} intensity={6} position={[2, 2, -5]} scale={3} />
        </Environment>
      </Canvas>
    </div>
  );
}
