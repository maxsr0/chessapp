"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { ContactShadows, Environment, Lightformer, MeshReflectorMaterial } from "@react-three/drei";
import * as THREE from "three";

// Staunton king profile as (radius, height) control points, bottom to top.
// A Catmull-Rom spline through these is spun into a solid with LatheGeometry.
const KING_PROFILE: [number, number][] = [
  [0, 0], [1.08, 0], [1.13, 0.05], [1.12, 0.15], [1.02, 0.2], [0.98, 0.27], [1.02, 0.33], [0.9, 0.41],
  [0.74, 0.5], [0.56, 0.7], [0.44, 1.05], [0.37, 1.45], [0.34, 1.78], [0.52, 1.84], [0.58, 1.9],
  [0.45, 1.97], [0.52, 2.02], [0.41, 2.08], [0.44, 2.22], [0.58, 2.46], [0.69, 2.63], [0.63, 2.69],
  [0.5, 2.71], [0.46, 2.77], [0.34, 2.87], [0.16, 2.94], [0, 2.96],
];
const CROWN_Y = 2.65;
const CROWN_R = 0.67;

function crossGeometry() {
  const w = 0.09, h = 0.34, arm = 0.27, t = 0.085, armY = 0.1; // half-widths/heights
  const s = new THREE.Shape();
  s.moveTo(-w, -h);
  s.lineTo(w, -h);
  s.lineTo(w, armY - t);
  s.lineTo(arm, armY - t);
  s.lineTo(arm, armY + t);
  s.lineTo(w, armY + t);
  s.lineTo(w, h);
  s.lineTo(-w, h);
  s.lineTo(-w, armY + t);
  s.lineTo(-arm, armY + t);
  s.lineTo(-arm, armY - t);
  s.lineTo(-w, armY - t);
  s.closePath();
  const g = new THREE.ExtrudeGeometry(s, { depth: 0.14, bevelEnabled: true, bevelThickness: 0.035, bevelSize: 0.03, bevelSegments: 4 });
  g.center();
  return g;
}

type Palette = { light: boolean; accent: string; paper: string; sqLight: string; sqDark: string };

function readPalette(): Palette {
  const s = getComputedStyle(document.documentElement);
  const v = (n: string, d: string) => s.getPropertyValue(n).trim() || d;
  return {
    light: document.documentElement.getAttribute("data-theme") === "light",
    accent: v("--accent", "#d4a64a"),
    paper: v("--paper", "#0f1a15"),
    sqLight: v("--sq-light", "#e6dcc3"),
    sqDark: v("--sq-dark", "#3f6b55"),
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

/** 8x8 board texture, tiled across the floor. */
function useBoardTexture(a: string, b: string) {
  const tex = useMemo(() => {
    const c = document.createElement("canvas");
    c.width = c.height = 512;
    const ctx = c.getContext("2d")!;
    const n = 8, sz = c.width / n;
    for (let y = 0; y < n; y++)
      for (let x = 0; x < n; x++) {
        ctx.fillStyle = (x + y) % 2 ? a : b;
        ctx.fillRect(x * sz, y * sz, sz, sz);
      }
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(2.5, 2.5);
    t.anisotropy = 8;
    return t;
  }, [a, b]);
  useEffect(() => () => tex.dispose(), [tex]);
  return tex;
}

function King({ palette, reduced }: { palette: Palette; reduced: boolean }) {
  const group = useRef<THREE.Group>(null);
  const intro = useRef(reduced ? 1 : 0);
  const body = useMemo(() => {
    const curve = new THREE.SplineCurve(KING_PROFILE.map(([x, y]) => new THREE.Vector2(x, y)));
    const pts = curve.getPoints(200).map((p) => new THREE.Vector2(Math.max(0, p.x), p.y));
    return new THREE.LatheGeometry(pts, 160);
  }, []);
  const cross = useMemo(() => crossGeometry(), []);
  const beads = useMemo(
    () =>
      Array.from({ length: 14 }, (_, i) => {
        const a = (i / 14) * Math.PI * 2;
        return [Math.cos(a) * CROWN_R, CROWN_Y + 0.05, Math.sin(a) * CROWN_R] as const;
      }),
    [],
  );

  const material = useMemo(
    () =>
      palette.light
        ? new THREE.MeshPhysicalMaterial({ color: "#16130f", roughness: 0.22, clearcoat: 1, clearcoatRoughness: 0.08, envMapIntensity: 1.2 })
        : new THREE.MeshPhysicalMaterial({
            color: "#f1e8d4",
            roughness: 0.32,
            clearcoat: 0.8,
            clearcoatRoughness: 0.15,
            sheen: 0.5,
            sheenColor: new THREE.Color("#fff1cf"),
            envMapIntensity: 1.1,
          }),
    [palette.light],
  );
  useEffect(() => () => material.dispose(), [material]);

  useFrame(({ pointer }, rawDt) => {
    const g = group.current;
    if (!g) return;
    const dt = Math.min(rawDt, 1 / 30); // no jumps after a stalled frame
    intro.current = Math.min(1, intro.current + dt * 0.7);
    const e = 1 - Math.pow(1 - intro.current, 4); // easeOutQuart
    // The piece is set down onto the board, then lifts a little as the page scrolls.
    const scroll = Math.min(window.scrollY, 800);
    g.position.set(0, -1.45 + (1 - e) * 1.1 + scroll * 0.001, 0);
    if (reduced) return;
    g.rotation.y += dt * 0.18 * (0.4 + e * 0.6);
    g.rotation.x = THREE.MathUtils.damp(g.rotation.x, -pointer.y * 0.08, 3, dt);
    g.rotation.z = THREE.MathUtils.damp(g.rotation.z, pointer.x * 0.05, 3, dt);
  });

  return (
    <group ref={group} rotation={[0, 0.6, 0]} scale={1.08}>
      <mesh geometry={body} material={material} />
      <mesh position={[0, CROWN_Y, 0]} rotation={[Math.PI / 2, 0, 0]} material={material}>
        <torusGeometry args={[CROWN_R, 0.026, 12, 120]} />
      </mesh>
      {beads.map((p, i) => (
        <mesh key={i} position={p} material={material}>
          <sphereGeometry args={[0.045, 16, 12]} />
        </mesh>
      ))}
      <mesh position={[0, 3.01, 0]} material={material}>
        <sphereGeometry args={[0.11, 24, 16]} />
      </mesh>
      <mesh geometry={cross} position={[0, 3.43, 0]} material={material} />
    </group>
  );
}

/** Wide screens: the king sits right of the copy. Narrow: centered. */
function Stage({ children }: { children: React.ReactNode }) {
  const { viewport, size } = useThree();
  const wide = size.width / size.height > 1.15;
  return <group position={[wide ? viewport.width * 0.2 : 0, 0, 0]}>{children}</group>;
}

function Floor({ palette }: { palette: Palette }) {
  const map = useBoardTexture(palette.sqLight, palette.sqDark);
  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -1.46, 0]}>
      <planeGeometry args={[40, 40]} />
      <MeshReflectorMaterial
        map={map}
        color={palette.light ? "#f4f1ea" : "#5d6259"}
        resolution={1024}
        blur={[400, 120]}
        mixBlur={1}
        mixStrength={palette.light ? 1.2 : 2.2}
        mixContrast={1}
        depthScale={1}
        minDepthThreshold={0.4}
        maxDepthThreshold={1.4}
        mirror={0.6}
        roughness={0.85}
        metalness={0.1}
      />
    </mesh>
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

export default function HeroKingScene() {
  const palette = usePalette();
  const [reduced] = useState(() => window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  const wrap = useRef<HTMLDivElement>(null);
  const inView = useInView(wrap);
  const fog = useMemo(() => new THREE.Color(palette.paper), [palette.paper]);

  return (
    <div ref={wrap} className="absolute inset-0">
      <Canvas
        dpr={[1, 2]}
        frameloop={!inView ? "never" : reduced ? "demand" : "always"}
        camera={{ position: [0, 1.1, 11], fov: 30 }}
        gl={{ antialias: true, alpha: true, toneMapping: THREE.ACESFilmicToneMapping, toneMappingExposure: 1.05 }}
        onCreated={({ camera }) => camera.lookAt(0, 0.3, 0)}
        resize={{ debounce: 0 }}
        aria-hidden
      >
        <fog attach="fog" args={[fog, 10, 24]} />
        <ambientLight intensity={0.15} />
        <directionalLight position={[3, 6, 4]} intensity={1.4} />
        {/* brass rim lights from behind */}
        <spotLight position={[-4, 5, -4]} angle={0.5} penumbra={1} intensity={140} color={palette.accent} />
        <pointLight position={[3.5, 1.5, -2.5]} intensity={45} color={palette.accent} />
        <spotLight position={[2, 9, 5]} angle={0.35} penumbra={0.9} intensity={palette.light ? 60 : 90} />
        <Stage>
          <King palette={palette} reduced={reduced} />
          <ContactShadows position={[0, -1.45, 0]} opacity={palette.light ? 0.55 : 0.8} scale={10} blur={2.4} far={2.5} resolution={512} />
        </Stage>
        <Floor palette={palette} />
        {/* local studio environment: no network fetch, just glowing cards for reflections */}
        <Environment resolution={256} frames={1}>
          <Lightformer form="rect" intensity={3} position={[0, 5, -6]} scale={[10, 3, 1]} />
          <Lightformer form="rect" intensity={2} position={[-6, 2, 1]} rotation-y={Math.PI / 2} scale={[8, 1.2, 1]} />
          <Lightformer form="rect" intensity={1.4} position={[6, 1, 2]} rotation-y={-Math.PI / 2} scale={[8, 0.8, 1]} />
          <Lightformer form="ring" color={palette.accent} intensity={4} position={[-3, 3, -4]} scale={2.5} />
        </Environment>
      </Canvas>
    </div>
  );
}
