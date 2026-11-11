"use client";

import clsx from "clsx";
import { animate, motion, useInView, useMotionTemplate, useMotionValue, useReducedMotion } from "motion/react";
import { useEffect, useRef, useState } from "react";

const EASE = [0.22, 1, 0.36, 1] as const; // easeOutQuint-ish: fast in, long settle

/** Fade-and-rise once when scrolled into view. `delay` staggers siblings. */
export function Reveal({
  children,
  className,
  delay = 0,
  y = 18,
  as = "div",
}: {
  children: React.ReactNode;
  className?: string;
  delay?: number;
  y?: number;
  as?: "div" | "li" | "section" | "span";
}) {
  const reduce = useReducedMotion();
  const M = motion[as];
  return (
    <M
      className={className}
      initial={reduce ? false : { opacity: 0, y, filter: "blur(6px)" }}
      whileInView={{ opacity: 1, y: 0, filter: "blur(0px)" }}
      viewport={{ once: true, margin: "0px 0px -8% 0px" }}
      transition={{ duration: 0.8, ease: EASE, delay }}
    >
      {children}
    </M>
  );
}

/** Counts up from 0 to `value` when first visible, keeping the final formatting. */
export function NumberTicker({ value, format }: { value: number; format: (v: number) => string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true });
  const reduce = useReducedMotion();
  const [shown, setShown] = useState(0);
  const from = useRef(0); // live stats refresh mid-sync: continue from the last value, not 0

  useEffect(() => {
    if (!inView || reduce) return;
    const c = animate(from.current, value, {
      duration: 1.1,
      ease: EASE,
      onUpdate: (v) => {
        from.current = v;
        setShown(v);
      },
    });
    return () => c.stop();
  }, [inView, value, reduce]);

  return (
    <span ref={ref} className="tabular-nums">
      {/* screen readers get the final value, not every frame */}
      <span aria-hidden>{format(reduce ? value : shown)}</span>
      <span className="sr-only">{format(value)}</span>
    </span>
  );
}

/** A card with a soft brass glow that follows the cursor. */
export function SpotlightCard({
  children,
  className,
  style,
  glow = "var(--accent)",
}: {
  children: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
  glow?: string;
}) {
  const x = useMotionValue(-400);
  const y = useMotionValue(-400);
  const bg = useMotionTemplate`radial-gradient(260px circle at ${x}px ${y}px, color-mix(in oklab, ${glow} 28%, transparent), transparent 70%)`;
  return (
    <div
      className={clsx("group relative overflow-hidden", className)}
      style={style}
      onPointerMove={(e) => {
        const r = e.currentTarget.getBoundingClientRect();
        x.set(e.clientX - r.left);
        y.set(e.clientY - r.top);
      }}
      onPointerLeave={() => {
        x.set(-400);
        y.set(-400);
      }}
    >
      <motion.div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-300 group-hover:opacity-100"
        style={{ background: bg }}
      />
      {children}
    </div>
  );
}
