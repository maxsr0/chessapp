"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { ContactShadows, Environment, Lightformer, MeshReflectorMaterial } from "@react-three/drei";
import * as THREE from "three";

/* ---------- geometry ---------- */

/**
 * Staunton king half-profile (radius, height), bottom to top, built like a lathe-turned piece:
 * straight runs joined by small fillets, beads, a cove, a flared stem and a tulip crown.
 * Arcs (not one big spline) keep the machined edges crisp but never razor-sharp.
 */
function kingProfile(): THREE.Vector2[] {
  const p: THREE.Vector2[] = [];
  const to = (r: number, y: number) => p.push(new THREE.Vector2(r, y));
  const arc = (cx: number, cy: number, R: number, a0: number, a1: number, n = 10) => {
    for (let i = 0; i <= n; i++) {
      const a = THREE.MathUtils.degToRad(a0 + ((a1 - a0) * i) / n);
      to(cx + R * Math.cos(a), cy + R * Math.sin(a));
    }
  };
  const curve = (r: (t: number) => number, y0: number, y1: number, n = 28) => {
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      to(r(t), y0 + (y1 - y0) * t);
    }
  };

  to(0, 0);
  arc(1.05, 0.03, 0.03, -90, 0, 4); // foot: underside fillet
  arc(1.05, 0.14, 0.03, 0, 90, 4); // foot: top fillet
  arc(1.0, 0.24, 0.07, -90, 90, 14); // base bead
  arc(0.96, 0.47, 0.16, 270, 180, 14); // cove
  arc(0.8, 0.51, 0.04, -90, 90, 8); // fillet ring
  curve((t) => 0.36 + 0.34 * Math.pow(1 - t, 2.4), 0.56, 1.62); // flared stem
  arc(0.54, 1.68, 0.04, -90, 90, 8); // lower collar disk
  arc(0.44, 1.77, 0.05, -90, 90, 10); // collar bead
  arc(0.6, 1.87, 0.04, -90, 90, 8); // upper collar disk
  to(0.38, 1.93);
  to(0.38, 2.0); // neck
  curve((t) => 0.38 + 0.34 * Math.pow(t, 1.8), 2.0, 2.58, 24); // tulip crown
  arc(0.72, 2.62, 0.04, -90, 90, 8); // crown rim
  to(0.62, 2.68);
  for (let i = 0; i <= 16; i++) {
    const a = THREE.MathUtils.degToRad((80 * i) / 16); // dome (quarter ellipse)
    to(0.6 * Math.cos(a), 2.7 + 0.3 * Math.sin(a));
  }
  arc(0, 3.08, 0.1, -60, 90, 12); // finial ball
  return p;
}
const CROSS_Y = 3.47;

/** Cross pattée: arms flare toward their ends, with a soft bevel. */
function crossGeometry() {
  const w = 0.062, f = 0.105, fa = 0.088, armY = 0.08, armX = 0.26, top = 0.3, bot = -0.32;
  const s = new THREE.Shape();
  s.moveTo(-f, bot);
  s.lineTo(f, bot);
  s.lineTo(w, armY - w);
  s.lineTo(armX, armY - fa);
  s.lineTo(armX, armY + fa);
  s.lineTo(w, armY + w);
  s.lineTo(f, top);
  s.lineTo(-f, top);
  s.lineTo(-w, armY + w);
  s.lineTo(-armX, armY + fa);
  s.lineTo(-armX, armY - fa);
  s.lineTo(-w, armY - w);
  s.closePath();
  const g = new THREE.ExtrudeGeometry(s, { depth: 0.09, bevelEnabled: true, bevelThickness: 0.035, bevelSize: 0.028, bevelSegments: 6 });
  g.center();
  return g;
}

/* ---------- theme ---------- */

type Palette = { light: boolean; accent: string; paper: string };

function readPalette(): Palette {
  const s = getComputedStyle(document.documentElement);
  const v = (n: string, d: string) => s.getPropertyValue(n).trim() || d;
  return {
    light: document.documentElement.getAttribute("data-theme") === "light",
    accent: v("--accent", "#d4a64a"),
    paper: v("--paper", "#0f1a15"),
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

/** Low-contrast board squares: a hint of chess under the piece, not a pattern that competes with it. */
function useBoardTexture(light: boolean) {
  const tex = useMemo(() => {
    const [a, b] = light ? ["#e8dfca", "#dccfb3"] : ["#15231c", "#1b2e24"];
    const c = document.createElement("canvas");
    c.width = c.height = 256;
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
    t.repeat.set(3, 3);
    t.anisotropy = 8;
    return t;
  }, [light]);
  useEffect(() => () => tex.dispose(), [tex]);
  return tex;
}

/* ---------- scene ---------- */

function King({ light, reduced }: { light: boolean; reduced: boolean }) {
  const group = useRef<THREE.Group>(null);
  const intro = useRef(reduced ? 1 : 0);

  const body = useMemo(() => new THREE.LatheGeometry(kingProfile(), 180), []);
  const cross = useMemo(() => crossGeometry(), []);
  useEffect(
    () => () => {
      body.dispose();
      cross.dispose();
    },
    [body, cross],
  );

  // Polished boxwood/ivory in dark mode, black lacquer in light mode.
  const material = useMemo(
    () =>
      light
        ? new THREE.MeshPhysicalMaterial({ color: "#0e0d0c", roughness: 0.16, clearcoat: 1, clearcoatRoughness: 0.04, envMapIntensity: 1.6 })
        : new THREE.MeshPhysicalMaterial({
            color: "#efe5cf",
            roughness: 0.24,
            clearcoat: 1,
            clearcoatRoughness: 0.06,
            sheen: 0.35,
            sheenColor: new THREE.Color("#fff4dc"),
            envMapIntensity: 1.25,
          }),
    [light],
  );
  useEffect(() => () => material.dispose(), [material]);

  useFrame(({ pointer, clock }, rawDt) => {
    const g = group.current;
    if (!g) return;
    const dt = Math.min(rawDt, 1 / 30); // no rotation jumps after a stalled frame
    // Intro runs on wall-clock time, so a slow or throttled device still lands the piece on time.
    if (intro.current < 1) intro.current = Math.min(1, clock.elapsedTime / 1.5);
    const e = 1 - Math.pow(1 - intro.current, 4); // easeOutQuart
    // The piece is set down onto the board, then lifts a little as the page scrolls.
    const scroll = Math.min(window.scrollY, 800);
    g.position.y = -1.45 + (1 - e) * 1.1 + scroll * 0.001;
    if (reduced) return;
    g.rotation.y += dt * 0.16 * (0.4 + e * 0.6);
    g.rotation.x = THREE.MathUtils.damp(g.rotation.x, -pointer.y * 0.07, 3, dt);
    g.rotation.z = THREE.MathUtils.damp(g.rotation.z, pointer.x * 0.045, 3, dt);
  });

  return (
    <group ref={group} rotation={[0, 0.6, 0]} scale={1.08}>
      <mesh geometry={body} material={material} />
      <mesh geometry={cross} position={[0, CROSS_Y, 0]} material={material} />
    </group>
  );
}

/** Wide screens: the king sits right of the copy. Narrow: centered. */
function Stage({ children }: { children: React.ReactNode }) {
  const { viewport, size } = useThree();
  const wide = size.width / size.height > 1.15;
  return <group position={[wide ? viewport.width * 0.2 : 0, 0, 0]}>{children}</group>;
}

function Floor({ light }: { light: boolean }) {
  const map = useBoardTexture(light);
  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -1.46, 0]}>
      <planeGeometry args={[40, 40]} />
      <MeshReflectorMaterial
        map={map}
        resolution={1024}
        blur={[260, 80]}
        mixBlur={0.8}
        // The mirror also reflects the transparent (black) sky: fine on felt, muddy on cream,
        // so light mode keeps only a faint, close reflection.
        mixStrength={light ? 0.6 : 5}
        mixContrast={1.1}
        depthScale={light ? 2 : 1.1}
        minDepthThreshold={0.35}
        maxDepthThreshold={light ? 0.9 : 1.3}
        mirror={light ? 0.2 : 0.85}
        roughness={light ? 1 : 0.7}
        metalness={light ? 0 : 0.2}
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
  const { light, accent, paper } = usePalette();
  const [reduced] = useState(() => window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  const wrap = useRef<HTMLDivElement>(null);
  const inView = useInView(wrap);
  const fog = useMemo(() => new THREE.Color(paper), [paper]);

  return (
    <div ref={wrap} className="absolute inset-0">
      <Canvas
        dpr={[1, 2]}
        frameloop={!inView ? "never" : reduced ? "demand" : "always"}
        camera={{ position: [0, 0.75, 11], fov: 28 }}
        gl={{ antialias: true, alpha: true, toneMapping: THREE.ACESFilmicToneMapping, toneMappingExposure: light ? 1.0 : 1.1 }}
        onCreated={({ camera }) => camera.lookAt(0, 0.45, 0)}
        resize={{ debounce: 0 }}
        aria-hidden
      >
        <fog attach="fog" args={[fog, 9, 21]} />
        <ambientLight intensity={0.08} />
        {/* key light from above-left, and a brass kicker from behind */}
        <spotLight position={[-3, 8, 5]} angle={0.32} penumbra={1} intensity={light ? 70 : 110} />
        <spotLight position={[3, 4, -5]} angle={0.5} penumbra={1} intensity={90} color={accent} />
        <Stage>
          <King light={light} reduced={reduced} />
          <ContactShadows position={[0, -1.449, 0]} opacity={light ? 0.5 : 0.85} scale={8} blur={2.2} far={2.2} resolution={512} />
        </Stage>
        <Floor light={light} />
        {/* Studio environment built from glowing cards (no HDR download). Tall strips give the
            long vertical highlights that make a turned piece read as polished. */}
        <Environment resolution={512} frames={1}>
          <Lightformer form="rect" intensity={4} position={[-4, 1, 3]} rotation-y={Math.PI / 3} scale={[0.6, 9, 1]} />
          <Lightformer form="rect" intensity={2.5} position={[4.5, 1, 2]} rotation-y={-Math.PI / 3} scale={[0.4, 9, 1]} />
          <Lightformer form="rect" intensity={1.6} position={[0, 6, 0]} rotation-x={Math.PI / 2} scale={[6, 6, 1]} />
          <Lightformer form="rect" intensity={1} position={[0, 3, 8]} scale={[8, 2, 1]} />
          <Lightformer form="ring" color={accent} intensity={6} position={[2, 2, -5]} scale={3} />
        </Environment>
      </Canvas>
    </div>
  );
}
