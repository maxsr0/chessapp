"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { ContactShadows } from "@react-three/drei";
import * as THREE from "three";

// Staunton-style king profile as (radius, height) control points, bottom to top.
// A Catmull-Rom spline through these is spun into a solid with LatheGeometry.
const KING_PROFILE: [number, number][] = [
  [0, 0], [1.1, 0], [1.14, 0.06], [1.12, 0.16], [1.0, 0.22], [0.98, 0.3], [1.02, 0.36], [0.88, 0.44],
  [0.7, 0.54], [0.52, 0.75], [0.42, 1.1], [0.36, 1.5], [0.34, 1.75], [0.5, 1.82], [0.56, 1.88],
  [0.44, 1.95], [0.5, 2.0], [0.4, 2.06], [0.44, 2.2], [0.58, 2.45], [0.68, 2.62], [0.62, 2.68],
  [0.5, 2.7], [0.46, 2.76], [0.34, 2.86], [0.16, 2.93], [0, 2.95],
];
const CROWN_Y = 2.64;
const CROWN_R = 0.66;

function crossShape() {
  const w = 0.09, h = 0.34, arm = 0.26, t = 0.08, armY = 0.1; // half-widths/heights
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
  const g = new THREE.ExtrudeGeometry(s, {
    depth: 0.1,
    bevelEnabled: true,
    bevelThickness: 0.035,
    bevelSize: 0.03,
    bevelSegments: 4,
  });
  g.center();
  return g;
}

function cssColors() {
  const s = getComputedStyle(document.documentElement);
  const light = document.documentElement.getAttribute("data-theme") === "light";
  return {
    light,
    accent: s.getPropertyValue("--accent").trim() || "#d4a64a",
    paper: s.getPropertyValue("--paper").trim() || "#0f1a15",
  };
}

function useThemeColors() {
  const [c, setC] = useState(cssColors);
  useEffect(() => {
    const obs = new MutationObserver(() => setC(cssColors()));
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    return () => obs.disconnect();
  }, []);
  return c;
}

function King({ light, reduced }: { light: boolean; reduced: boolean }) {
  const group = useRef<THREE.Group>(null);
  const body = useMemo(() => {
    const curve = new THREE.SplineCurve(KING_PROFILE.map(([x, y]) => new THREE.Vector2(x, y)));
    const pts = curve.getPoints(160).map((p) => new THREE.Vector2(Math.max(0, p.x), p.y));
    return new THREE.LatheGeometry(pts, 128);
  }, []);
  const cross = useMemo(() => crossShape(), []);
  const beads = useMemo(
    () =>
      Array.from({ length: 12 }, (_, i) => {
        const a = (i / 12) * Math.PI * 2;
        return [Math.cos(a) * CROWN_R, CROWN_Y + 0.05, Math.sin(a) * CROWN_R] as const;
      }),
    [],
  );

  useFrame(({ pointer }, dt) => {
    const g = group.current;
    if (!g || reduced) return;
    g.rotation.y += dt * 0.22;
    g.rotation.x = THREE.MathUtils.lerp(g.rotation.x, -pointer.y * 0.1, 0.05);
    g.rotation.z = THREE.MathUtils.lerp(g.rotation.z, pointer.x * 0.06, 0.05);
  });

  const material = useMemo(
    () =>
      light
        ? new THREE.MeshPhysicalMaterial({
            color: "#1a1714",
            roughness: 0.25,
            clearcoat: 1,
            clearcoatRoughness: 0.1,
          })
        : new THREE.MeshPhysicalMaterial({
            color: "#efe6d2",
            roughness: 0.35,
            clearcoat: 0.6,
            clearcoatRoughness: 0.2,
            sheen: 0.4,
            sheenColor: new THREE.Color("#fff3d6"),
            emissive: new THREE.Color("#3a2a10"),
            emissiveIntensity: 0.4,
          }),
    [light],
  );

  return (
    <group ref={group} position={[0, -1.8, 0]} rotation={[0, 0.5, 0]}>
      <mesh geometry={body} material={material} castShadow />
      <mesh position={[0, CROWN_Y, 0]} rotation={[Math.PI / 2, 0, 0]} material={material}>
        <torusGeometry args={[CROWN_R, 0.025, 12, 96]} />
      </mesh>
      {beads.map((p, i) => (
        <mesh key={i} position={p} material={material}>
          <sphereGeometry args={[0.045, 16, 12]} />
        </mesh>
      ))}
      <mesh position={[0, 3.0, 0]} material={material}>
        <sphereGeometry args={[0.11, 24, 16]} />
      </mesh>
      <mesh geometry={cross} position={[0, 3.42, 0]} material={material} castShadow />
    </group>
  );
}

export default function HeroKingScene() {
  const { light, accent, paper } = useThemeColors();
  const [reduced] = useState(() => window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  return (
    <Canvas
      dpr={[1, 2]}
      frameloop={reduced ? "demand" : "always"}
      camera={{ position: [0, 0.3, 8.6], fov: 28 }}
      gl={{ antialias: true, alpha: true, toneMapping: THREE.ACESFilmicToneMapping, toneMappingExposure: 1.1 }}
      aria-hidden
    >
      <ambientLight intensity={0.25} />
      <hemisphereLight args={["#fff6e0", paper, 0.7]} />
      <directionalLight position={[3, 5, 4]} intensity={1.8} />
      <directionalLight position={[-4, 1, 3]} intensity={0.45} />
      {/* brass rim from behind */}
      <pointLight position={[-2.5, 2.5, -3]} intensity={45} color={accent} />
      <pointLight position={[2.5, 0.5, -3]} intensity={25} color={accent} />
      <King light={light} reduced={reduced} />
      <ContactShadows position={[0, -1.81, 0]} opacity={0.6} scale={8} blur={2.6} far={3.5} />
    </Canvas>
  );
}
