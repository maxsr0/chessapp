"use client";

import clsx from "clsx";
import { animate, motion, useInView, useMotionTemplate, useMotionValue, useReducedMotion } from "motion/react";
import { useEffect, useId, useRef, useState } from "react";

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

/**
 * A small radio group drawn as pills, with a brass thumb that slides to the selection.
 * Replaces native <select>s, whose open menus can't be themed.
 */
export function Segmented<T extends string | number>({
  label,
  value,
  options,
  onChange,
  disabled,
  format = (o) => String(o),
}: {
  label: string;
  value: T;
  options: readonly T[];
  onChange: (v: T) => void;
  disabled?: boolean;
  format?: (o: T) => string;
}) {
  const id = useId();
  return (
    <div className="flex items-center gap-2.5">
      <span className="label" id={id}>
        {label}
      </span>
      <div
        role="radiogroup"
        aria-labelledby={id}
        className={clsx(
          "relative inline-flex rounded-full border border-hair bg-panel/60 p-0.5",
          disabled && "opacity-50 pointer-events-none",
        )}
        onKeyDown={(e) => {
          const step = e.key === "ArrowRight" || e.key === "ArrowDown" ? 1 : e.key === "ArrowLeft" || e.key === "ArrowUp" ? -1 : 0;
          if (!step) return;
          e.preventDefault();
          const i = (options.indexOf(value) + step + options.length) % options.length;
          onChange(options[i]);
          (e.currentTarget.children[i] as HTMLElement | undefined)?.focus();
        }}
      >
        {options.map((o) => {
          const on = o === value;
          return (
            <button
              key={String(o)}
              type="button"
              role="radio"
              aria-checked={on}
              tabIndex={on ? 0 : -1}
              disabled={disabled}
              onClick={() => onChange(o)}
              className={clsx(
                "relative z-0 rounded-full px-3 py-1 font-mono text-[13px] capitalize transition-colors duration-200",
                on ? "text-on-accent" : "text-muted hover:text-ink",
              )}
            >
              {on && (
                <motion.span
                  layoutId={`seg-${id}`}
                  className="absolute inset-0 -z-10 rounded-full bg-accent"
                  transition={{ type: "spring", stiffness: 520, damping: 38 }}
                />
              )}
              {format(o)}
            </button>
          );
        })}
      </div>
    </div>
  );
}
