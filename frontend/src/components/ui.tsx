import clsx from "clsx";
import type { Classification } from "@/lib/api";
import { QUALITY } from "@/lib/chess";

export function SectionHead({ title, caption, className }: { title: string; caption?: string; className?: string }) {
  return (
    <div className={clsx("flex flex-wrap justify-between items-baseline gap-2 border-b-[2.5px] border-ink pb-3 mb-1.5", className)}>
      <h2 className="display text-[clamp(22px,3.4vw,34px)]">{title}</h2>
      {caption && <span className="label">{caption}</span>}
    </div>
  );
}

/** A single headline number: the form for one value, not a chart. */
export function StatTile({ label, value, sub }: { label: string; value: React.ReactNode; sub?: React.ReactNode }) {
  return (
    <div className="border-b border-hair sm:border-b-0 sm:border-r last:border-r-0 px-3 sm:px-5 py-4">
      <span className="label block">{label}</span>
      <b className="block font-display font-extrabold text-[clamp(28px,4vw,40px)] leading-tight tracking-tight">{value}</b>
      {sub && <span className="text-sm text-muted">{sub}</span>}
    </div>
  );
}

export function QualityBadge({ c, withLabel = true }: { c: Classification; withLabel?: boolean }) {
  const q = QUALITY[c];
  return (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
      <span className="inline-block size-2.5 rounded-full" style={{ background: q.color }} aria-hidden />
      {withLabel && <span>{q.label}</span>}
      {q.symbol && <span className="font-mono text-xs text-muted">{q.symbol}</span>}
    </span>
  );
}

export function Panel({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={clsx("border border-hair bg-panel/60 shadow-[inset_0_1px_0_var(--felt-glow)] p-4 sm:p-5", className)}>{children}</div>;
}

export function Empty({ children }: { children: React.ReactNode }) {
  return <p className="py-10 text-muted">{children}</p>;
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={clsx("shimmer", className)} />;
}

export const pct = (v: number | null | undefined, digits = 0) => (v == null ? "–" : `${v.toFixed(digits)}%`);
export const num = (v: number | null | undefined, digits = 1) => (v == null ? "–" : v.toFixed(digits));
