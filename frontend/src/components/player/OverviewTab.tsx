"use client";

import { useQuery } from "@tanstack/react-query";
import { api, type Classification } from "@/lib/api";
import { QUALITY } from "@/lib/chess";
import { MonthLine, RatingChart, WinRateBars } from "@/components/charts";
import { Empty, QualityBadge, SectionHead, Skeleton, StatTile, num, pct } from "@/components/ui";

const ORDER: Classification[] = ["best", "good", "inaccuracy", "mistake", "blunder"];

export function OverviewTab({ username }: { username: string }) {
  const { data: o, isLoading } = useQuery({ queryKey: ["overview", username], queryFn: () => api.overview(username) });

  if (isLoading) return <Skeleton className="h-72 w-full" />;
  if (!o || !o.games) return <Empty>No games yet. They&apos;ll appear here as soon as the import finishes.</Empty>;

  const r = o.results ?? {};
  const cc = o.classification_counts ?? {};
  const totalMoves = ORDER.reduce((a, k) => a + (cc[k] ?? 0), 0);
  const analyzedGames = o.by_month?.reduce((a, m) => a + m.games, 0) ?? o.games;
  const blunders = cc.blunder ?? 0;

  // Convert UTC hours to the viewer's local time
  const offset = -new Date().getTimezoneOffset() / 60;
  const hours = (o.by_hour ?? [])
    .map((h) => ({ ...h, local: (((Number(h.hour) + offset) % 24) + 24) % 24 }))
    .sort((a, b) => a.local - b.local)
    .map((h) => ({ ...h, hourLabel: `${h.local}:00` }));

  return (
    <div className="space-y-14">
      <div className="grid grid-cols-2 sm:grid-cols-4 border-y border-ink">
        <StatTile label="Games" value={o.games} sub={`${r.win ?? 0}W · ${r.draw ?? 0}D · ${r.loss ?? 0}L`} />
        <StatTile label="Win rate" value={pct(o.win_rate)} />
        <StatTile label="Accuracy" value={num(o.avg_accuracy)} sub="Average per game" />
        <StatTile label="Blunders / game" value={num(blunders / Math.max(analyzedGames, 1))} sub={`${blunders} total`} />
      </div>

      {totalMoves > 0 && (
        <section>
          <SectionHead title="Move quality" caption={`${totalMoves.toLocaleString()} of your moves`} />
          {/* One stacked bar: segments separated by a 2px gap, each labeled below */}
          <div className="flex h-4 gap-[2px] mt-5" role="img" aria-label="Share of moves by quality">
            {ORDER.map((k) =>
              cc[k] ? (
                <div
                  key={k}
                  className="first:rounded-l last:rounded-r"
                  style={{ width: `${(100 * (cc[k] ?? 0)) / totalMoves}%`, background: QUALITY[k].color }}
                  title={`${QUALITY[k].label}: ${cc[k]}`}
                />
              ) : null,
            )}
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 mt-4">
            {ORDER.map((k) => (
              <div key={k} className="text-sm">
                <QualityBadge c={k} />
                <div className="font-mono text-muted">
                  {(cc[k] ?? 0).toLocaleString()} · {pct((100 * (cc[k] ?? 0)) / totalMoves, 1)}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {o.rating_history && o.rating_history.length > 1 && (
        <section>
          <RatingChart history={o.rating_history} />
        </section>
      )}

      {o.by_month && o.by_month.length > 0 && (
        <section className="grid md:grid-cols-2 gap-10">
          <MonthLine title="Accuracy by month" data={o.by_month} dataKey="accuracy" format={(v) => v.toFixed(1)} />
          <MonthLine
            title="Blunders per game"
            caption="Lower is better"
            data={o.by_month}
            dataKey="blunders_per_game"
            format={(v) => v.toFixed(1)}
            domain={[0, "auto"]}
          />
        </section>
      )}

      <section className="grid md:grid-cols-2 gap-10">
        {o.by_rating_diff && (
          <WinRateBars
            title="Win rate vs opponent strength"
            caption="Opponent's rating minus yours"
            data={o.by_rating_diff}
            category="rating_diff"
          />
        )}
        {hours.length > 0 && (
          <WinRateBars title="Win rate by hour" caption="Your local time" data={hours} category="hourLabel" />
        )}
      </section>

      {o.by_time_class && (
        <section>
          <SectionHead title="By time control" />
          <table className="w-full text-left">
            <thead>
              <tr className="label">
                <th className="py-2 px-3 font-normal">Time control</th>
                <th className="py-2 px-3 font-normal text-right">Games</th>
                <th className="py-2 px-3 font-normal text-right">Win rate</th>
                <th className="py-2 px-3 font-normal text-right">Accuracy</th>
              </tr>
            </thead>
            <tbody>
              {o.by_time_class.map((t) => (
                <tr key={t.time_class} className="border-t border-hair">
                  <td className="py-3 px-3 font-semibold capitalize">{t.time_class}</td>
                  <td className="py-3 px-3 text-right font-mono">{t.games}</td>
                  <td className="py-3 px-3 text-right font-mono">{pct(t.win_rate)}</td>
                  <td className="py-3 px-3 text-right font-mono">{num(t.accuracy)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}
    </div>
  );
}
