"use client";

import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

// Series color follows the entity (time control), never its rank.
export const TIME_CLASS_COLOR: Record<string, string> = {
  bullet: "var(--series-1)",
  blitz: "var(--series-2)",
  rapid: "var(--series-3)",
  daily: "var(--series-4)",
};
const TIME_CLASS_ORDER = ["bullet", "blitz", "rapid", "daily"];

const axis = { stroke: "var(--hair)", tick: { fill: "var(--muted)", fontSize: 12 }, tickLine: false };
const grid = <CartesianGrid stroke="var(--hair)" strokeDasharray="0" vertical={false} />;

type TipRow = { label: string; value: string; color?: string };
function Tip({ title, rows }: { title: string; rows: TipRow[] }) {
  return (
    <div className="bg-paper border border-ink px-3 py-2 text-sm shadow-sm">
      <div className="label mb-1 !text-ink">{title}</div>
      {rows.map((r) => (
        <div key={r.label} className="flex items-center gap-2">
          {r.color && <span className="inline-block size-2.5 rounded-full" style={{ background: r.color }} />}
          <span className="text-muted">{r.label}</span>
          <span className="ml-auto pl-4 font-mono">{r.value}</span>
        </div>
      ))}
    </div>
  );
}

function Frame({ title, caption, height = 240, children }: { title: string; caption?: string; height?: number; children: React.ReactElement }) {
  return (
    <figure>
      <figcaption className="mb-3">
        <b className="font-display font-extrabold text-lg tracking-tight">{title}</b>
        {caption && <span className="block text-sm text-muted">{caption}</span>}
      </figcaption>
      <div style={{ height }}>
        <ResponsiveContainer width="100%" height="100%">
          {children}
        </ResponsiveContainer>
      </div>
    </figure>
  );
}

export function Legend({ items }: { items: { label: string; color: string }[] }) {
  return (
    <div className="flex flex-wrap gap-x-5 gap-y-1 mt-3 text-sm text-muted">
      {items.map((i) => (
        <span key={i.label} className="inline-flex items-center gap-2">
          <span className="inline-block w-4 h-[3px] rounded" style={{ background: i.color }} />
          {i.label}
        </span>
      ))}
    </div>
  );
}

/** Rating over time, one line per time control. */
export function RatingChart({ history }: { history: { end_time: string; time_class: string; player_rating: number }[] }) {
  const classes = TIME_CLASS_ORDER.filter((tc) => history.some((h) => h.time_class === tc));
  const data = history.map((h) => ({ date: h.end_time, [h.time_class]: h.player_rating }));
  return (
    <>
      <Frame title="Rating" caption="After each game, by time control">
        <LineChart data={data} margin={{ top: 8, right: 8, left: -8, bottom: 0 }}>
          {grid}
          <XAxis dataKey="date" {...axis} minTickGap={40} tickFormatter={(d: string) => d.slice(5)} />
          <YAxis {...axis} domain={["dataMin - 30", "dataMax + 30"]} width={48} />
          <Tooltip
            cursor={{ stroke: "var(--muted)", strokeWidth: 1 }}
            content={({ active, payload, label }) =>
              active && payload?.length ? (
                <Tip
                  title={String(label)}
                  rows={payload.map((p) => ({ label: String(p.dataKey), value: String(p.value), color: TIME_CLASS_COLOR[String(p.dataKey)] }))}
                />
              ) : null
            }
          />
          {classes.map((tc) => (
            <Line key={tc} dataKey={tc} stroke={TIME_CLASS_COLOR[tc]} strokeWidth={2} dot={false} connectNulls activeDot={{ r: 4, stroke: "var(--paper)", strokeWidth: 2 }} isAnimationActive={false} />
          ))}
        </LineChart>
      </Frame>
      {classes.length > 1 && <Legend items={classes.map((c) => ({ label: c, color: TIME_CLASS_COLOR[c] }))} />}
    </>
  );
}

/** Generic single-series line over months. */
export function MonthLine({
  title,
  caption,
  data,
  dataKey,
  format,
  domain,
}: {
  title: string;
  caption?: string;
  data: Record<string, unknown>[];
  dataKey: string;
  format: (v: number) => string;
  domain?: [number | string, number | string];
}) {
  return (
    <Frame title={title} caption={caption} height={200}>
      <LineChart data={data} margin={{ top: 8, right: 8, left: -8, bottom: 0 }}>
        {grid}
        <XAxis dataKey="month" {...axis} />
        <YAxis {...axis} width={48} domain={domain ?? ["auto", "auto"]} tickFormatter={(v: number) => format(v)} />
        <Tooltip
          cursor={{ stroke: "var(--muted)", strokeWidth: 1 }}
          content={({ active, payload, label }) =>
            active && payload?.length ? (
              <Tip
                title={String(label)}
                rows={[
                  { label: title, value: format(Number(payload[0].value)) },
                  ...(payload[0].payload.games != null ? [{ label: "Games", value: String(payload[0].payload.games) }] : []),
                ]}
              />
            ) : null
          }
        />
        <Line dataKey={dataKey} stroke="var(--series-1)" strokeWidth={2} dot={{ r: 4, fill: "var(--series-1)", stroke: "var(--paper)", strokeWidth: 2 }} isAnimationActive={false} />
      </LineChart>
    </Frame>
  );
}

/** Single-series bar chart for win rate by category. */
export function WinRateBars({
  title,
  caption,
  data,
  category,
  height = 220,
}: {
  title: string;
  caption?: string;
  data: { games: number; win_rate: number; [k: string]: unknown }[];
  category: string;
  height?: number;
}) {
  return (
    <Frame title={title} caption={caption} height={height}>
      <BarChart data={data} margin={{ top: 8, right: 8, left: -8, bottom: 0 }} barCategoryGap={2}>
        {grid}
        <XAxis dataKey={category} {...axis} interval="preserveStartEnd" />
        <YAxis {...axis} width={48} domain={[0, 100]} tickFormatter={(v: number) => `${v}%`} />
        <ReferenceLine y={50} stroke="var(--muted)" strokeDasharray="3 3" />
        <Tooltip
          cursor={{ fill: "var(--hair)", opacity: 0.5 }}
          content={({ active, payload, label }) =>
            active && payload?.length ? (
              <Tip
                title={String(label)}
                rows={[
                  { label: "Win rate", value: `${Number(payload[0].value).toFixed(0)}%` },
                  { label: "Games", value: String(payload[0].payload.games) },
                ]}
              />
            ) : null
          }
        />
        <Bar dataKey="win_rate" fill="var(--series-1)" radius={[4, 4, 0, 0]} isAnimationActive={false} />
      </BarChart>
    </Frame>
  );
}

/** Evaluation over a game, from White's view. Click a point to jump to that move. */
export function EvalChart({
  data,
  current,
  onSelect,
}: {
  data: { ply: number; pawns: number; label: string; move: string }[];
  current: number;
  onSelect: (ply: number) => void;
}) {
  return (
    <div style={{ height: 160 }} className="cursor-pointer">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart
          data={data}
          margin={{ top: 4, right: 0, left: -24, bottom: 0 }}
          onClick={(s) => {
            const i = Number(s?.activeTooltipIndex);
            if (Number.isFinite(i)) onSelect(i);
          }}
        >
          <defs>
            <linearGradient id="evalFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--series-1)" stopOpacity={0.35} />
              <stop offset="100%" stopColor="var(--series-1)" stopOpacity={0.05} />
            </linearGradient>
          </defs>
          <XAxis dataKey="ply" hide />
          <YAxis {...axis} domain={[-10, 10]} ticks={[-5, 0, 5]} width={40} />
          <ReferenceLine y={0} stroke="var(--muted)" />
          <ReferenceLine x={current + 1} stroke="var(--ink)" strokeWidth={1.5} />
          <Tooltip
            cursor={{ stroke: "var(--muted)", strokeWidth: 1 }}
            content={({ active, payload }) =>
              active && payload?.length ? (
                <Tip title={String(payload[0].payload.move)} rows={[{ label: "Eval (White)", value: String(payload[0].payload.label) }]} />
              ) : null
            }
          />
          <Area dataKey="pawns" stroke="var(--series-1)" strokeWidth={2} fill="url(#evalFill)" isAnimationActive={false} baseValue={0} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
