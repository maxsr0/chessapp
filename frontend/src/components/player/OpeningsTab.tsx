"use client";

import clsx from "clsx";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api, type OpeningRow } from "@/lib/api";
import { Empty, SectionHead, Skeleton, num, pct } from "@/components/ui";

// Win/draw/loss is polarity: cool pole, neutral gray middle, warm pole.
const WDL = { win: "var(--series-1)", draw: "var(--hovermuted)", loss: "var(--q-blunder)" };

type SortKey = "games" | "win_rate" | "accuracy" | "opening_errors_per_game";
const COLS: { key: SortKey; label: string }[] = [
  { key: "games", label: "Games" },
  { key: "win_rate", label: "Win %" },
  { key: "accuracy", label: "Accuracy" },
  { key: "opening_errors_per_game", label: "Early errors" },
];

function WdlBar({ r }: { r: OpeningRow }) {
  const parts = [
    { k: "win", n: r.wins },
    { k: "draw", n: r.draws },
    { k: "loss", n: r.losses },
  ] as const;
  return (
    <div className="flex h-2.5 gap-[2px] w-full min-w-24" title={`${r.wins}W ${r.draws}D ${r.losses}L`}>
      {parts.map((p) =>
        p.n ? (
          <div key={p.k} className="first:rounded-l last:rounded-r" style={{ width: `${(100 * p.n) / r.games}%`, background: WDL[p.k] }} />
        ) : null,
      )}
    </div>
  );
}

export function OpeningsTab({ username }: { username: string }) {
  const { data, isLoading } = useQuery({ queryKey: ["openings", username], queryFn: () => api.openings(username) });
  const [color, setColor] = useState<"all" | "white" | "black">("all");
  const [sort, setSort] = useState<{ key: SortKey; desc: boolean }>({ key: "games", desc: true });

  if (isLoading) return <Skeleton className="h-72 w-full" />;
  if (!data?.length) return <Empty>Not enough games yet. Openings show up once you have 3+ games in one.</Empty>;

  const rows = data
    .filter((r) => color === "all" || r.color === color)
    .sort((a, b) => {
      const d = (a[sort.key] ?? -1) - (b[sort.key] ?? -1);
      return sort.desc ? -d : d;
    });

  return (
    <section>
      <SectionHead title="Openings" caption="Grouped by family · 3+ games" />
      <div className="flex flex-wrap items-center justify-between gap-3 py-4">
        <div className="flex gap-1" role="group" aria-label="Filter by color">
          {(["all", "white", "black"] as const).map((c) => (
            <button
              key={c}
              onClick={() => setColor(c)}
              className={clsx("label px-3 py-1.5 border rounded-full", color === c ? "border-ink !text-ink" : "border-transparent")}
            >
              {c === "all" ? "Both colors" : `As ${c}`}
            </button>
          ))}
        </div>
        <div className="flex gap-4 text-sm text-muted">
          {Object.entries(WDL).map(([k, c]) => (
            <span key={k} className="inline-flex items-center gap-1.5 capitalize">
              <span className="inline-block size-2.5 rounded-sm" style={{ background: c }} />
              {k}
            </span>
          ))}
        </div>
      </div>

      <div className="overflow-x-auto -mx-4 px-4 sm:mx-0 sm:px-0">
        <table className="w-full text-left min-w-[640px]">
          <thead>
            <tr className="label">
              <th className="py-2 px-3 font-normal">Opening</th>
              <th className="py-2 px-3 font-normal w-40">Results</th>
              {COLS.map((c) => (
                <th key={c.key} className="py-2 px-3 font-normal text-right">
                  <button
                    onClick={() => setSort((s) => ({ key: c.key, desc: s.key === c.key ? !s.desc : true }))}
                    className={clsx("uppercase", sort.key === c.key && "!text-ink")}
                  >
                    {c.label}
                    {sort.key === c.key ? (sort.desc ? " ↓" : " ↑") : ""}
                  </button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={`${r.opening}-${r.color}`} className="border-t border-hair">
                <td className="py-3 px-3">
                  <b className="font-semibold">{r.opening}</b>
                  <span className="block text-sm text-muted capitalize">as {r.color}</span>
                </td>
                <td className="py-3 px-3">
                  <WdlBar r={r} />
                  <span className="block font-mono text-xs text-muted mt-1">
                    {r.wins}–{r.draws}–{r.losses}
                  </span>
                </td>
                <td className="py-3 px-3 text-right font-mono">{r.games}</td>
                <td className="py-3 px-3 text-right font-mono">{pct(r.win_rate)}</td>
                <td className="py-3 px-3 text-right font-mono">{num(r.accuracy)}</td>
                <td className="py-3 px-3 text-right font-mono">{num(r.opening_errors_per_game)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-sm text-muted mt-4">
        Early errors = mistakes and blunders per game in your first 10 moves.
      </p>
    </section>
  );
}
