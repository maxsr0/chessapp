"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { api, type Blunder, type Tag } from "@/lib/api";
import { TAG_HELP, TAG_LABEL, sanToSquares, sideToMove } from "@/lib/chess";
import { Board } from "@/components/Board";
import { MonthLine } from "@/components/charts";
import { Empty, SectionHead, Skeleton, StatTile, num, pct } from "@/components/ui";

/** Horizontal bars with direct labels: the value is text, the bar is just a guide. */
function HBars({ rows, max, format }: { rows: { key: string; label: React.ReactNode; value: number; help?: string }[]; max: number; format: (v: number) => string }) {
  return (
    <div className="divide-y divide-hair">
      {rows.map((r) => (
        <div key={r.key} className="grid grid-cols-[minmax(0,1fr)_auto] sm:grid-cols-[220px_minmax(0,1fr)_64px] gap-x-4 gap-y-1.5 items-center py-3">
          <div>
            <b className="font-semibold">{r.label}</b>
            {r.help && <span className="block text-sm text-muted">{r.help}</span>}
          </div>
          <div className="order-last col-span-2 sm:order-none sm:col-span-1 h-2.5 bg-hair/50 rounded">
            <div className="h-full bg-[var(--series-1)] rounded" style={{ width: `${(100 * r.value) / Math.max(max, 1e-9)}%` }} />
          </div>
          <span className="font-mono text-right">{format(r.value)}</span>
        </div>
      ))}
    </div>
  );
}

function BlunderCard({ b, username }: { b: Blunder; username: string }) {
  const played = sanToSquares(b.fen_before, b.san);
  const best = sanToSquares(b.fen_before, b.best_move);
  const arrows = [
    ...(played ? [{ startSquare: played.from, endSquare: played.to, color: "rgba(208,59,59,0.85)" }] : []),
    ...(best ? [{ startSquare: best.from, endSquare: best.to, color: "rgba(12,163,12,0.85)" }] : []),
  ];
  return (
    <Link
      href={`/game?id=${b.game_id}&ply=${b.ply}&u=${encodeURIComponent(username)}`}
      className="group block border border-hair hover:border-ink transition-colors"
    >
      <Board id={`b-${b.game_id}-${b.ply}`} fen={b.fen_before} orientation={sideToMove(b.fen_before)} arrows={arrows} showNotation={false} />
      <div className="p-3 text-sm">
        <div className="flex justify-between gap-2">
          <span className="inline-flex items-center gap-1.5 flex-wrap">
            <span className="inline-block size-2.5 rounded-full bg-[var(--q-blunder)]" aria-hidden />
            <b>{b.san}??</b>
            <span className="text-muted">best</span>
            <span className="inline-block size-2.5 rounded-full bg-[var(--q-best)]" aria-hidden />
            <b>{b.best_move}</b>
          </span>
          <span className="font-mono text-muted">−{b.win_drop.toFixed(0)}%</span>
        </div>
        <span className="block text-muted truncate">
          {b.phase}
          {b.tags.length ? ` · ${b.tags.map((t) => TAG_LABEL[t]).join(", ")}` : ""}
        </span>
      </div>
    </Link>
  );
}

export function WeaknessesTab({ username }: { username: string }) {
  const { data: w, isLoading } = useQuery({ queryKey: ["weaknesses", username], queryFn: () => api.weaknesses(username) });

  if (isLoading) return <Skeleton className="h-72 w-full" />;
  if (!w?.by_phase) return <Empty>Weaknesses appear once some games are analyzed.</Empty>;

  const phases = ["opening", "middlegame", "endgame"]
    .map((p) => w.by_phase!.find((x) => x.phase === p))
    .filter((x): x is NonNullable<typeof x> => !!x);
  const totalErrors = phases.reduce((a, p) => a + p.errors, 0);
  const tags = (Object.entries(w.tags ?? {}) as [Tag, number][])
    .filter(([t]) => t !== "time_trouble")
    .sort((a, b) => b[1] - a[1]);
  const tt = w.time_trouble;

  return (
    <div className="space-y-14">
      <section>
        <SectionHead title="Where you go wrong" caption="Mistakes + blunders per 100 moves" />
        <HBars
          rows={phases.map((p) => ({
            key: p.phase,
            label: <span className="capitalize">{p.phase}</span>,
            help: `${p.errors} errors in ${p.moves.toLocaleString()} moves · accuracy ${num(p.accuracy)}`,
            value: p.errors_per_100_moves,
          }))}
          max={Math.max(...phases.map((p) => p.errors_per_100_moves))}
          format={(v) => v.toFixed(1)}
        />
      </section>

      {tags.length > 0 && (
        <section>
          <SectionHead title="What your mistakes have in common" caption={`Out of ${totalErrors} mistakes + blunders`} />
          <HBars
            rows={tags.map(([t, n]) => ({ key: t, label: TAG_LABEL[t], help: TAG_HELP[t], value: n }))}
            max={tags[0][1]}
            format={(v) => String(v)}
          />
        </section>
      )}

      {tt && (tt.error_rate_low_clock != null || tt.error_rate_normal != null) && (
        <section>
          <SectionHead title="Clock pressure" caption="Share of moves that were mistakes or blunders" />
          <div className="grid grid-cols-2 border-b border-ink">
            <StatTile label="Plenty of time" value={pct(tt.error_rate_normal, 1)} />
            <StatTile label="Low on clock" value={pct(tt.error_rate_low_clock, 1)} sub="Under 10% of starting time" />
          </div>
        </section>
      )}

      {w.trend && w.trend.length > 1 && (
        <section>
          <MonthLine
            title="Errors per 100 moves, by month"
            caption="Lower is better"
            data={w.trend}
            dataKey="errors_per_100_moves"
            format={(v) => v.toFixed(1)}
            domain={[0, "auto"]}
          />
        </section>
      )}

      {w.worst_blunders && w.worst_blunders.length > 0 && (
        <section>
          <SectionHead title="Your worst blunders" caption="Red: what you played · Green: the best move" />
          <div className="grid grid-cols-1 min-[420px]:grid-cols-2 lg:grid-cols-4 gap-4 pt-4">
            {w.worst_blunders.slice(0, 8).map((b) => (
              <BlunderCard key={`${b.game_id}-${b.ply}`} b={b} username={username} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
