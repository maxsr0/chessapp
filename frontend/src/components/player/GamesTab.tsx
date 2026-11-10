"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api, type Game } from "@/lib/api";
import { Empty, Skeleton, num } from "@/components/ui";

// Same polarity colors as the openings W/D/L bar; the word carries the meaning, the dot is a cue.
const RESULT_DOT: Record<Game["result"], string> = {
  win: "var(--series-1)",
  draw: "var(--hovermuted)",
  loss: "var(--q-blunder)",
};

function Select<T extends string>({ label, value, options, onChange }: { label: string; value: T; options: T[]; onChange: (v: T) => void }) {
  return (
    <label className="label flex items-center gap-2">
      {label}
      <select
        value={value}
        onChange={(e) => onChange(e.target.value as T)}
        className="bg-transparent border border-hair rounded px-1.5 py-1 font-mono text-ink normal-case tracking-normal"
      >
        {options.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </select>
    </label>
  );
}

export function GamesTab({ username }: { username: string }) {
  const { data, isLoading } = useQuery({ queryKey: ["games", username], queryFn: () => api.games(username) });
  const [result, setResult] = useState<"all" | Game["result"]>("all");
  const [color, setColor] = useState<"all" | Game["color"]>("all");
  const [tc, setTc] = useState("all");
  const [q, setQ] = useState("");

  const games = useMemo(() => data?.games ?? [], [data]);
  const timeClasses = useMemo(() => ["all", ...new Set(games.map((g) => g.time_class))], [games]);
  const rows = games.filter(
    (g) =>
      (result === "all" || g.result === result) &&
      (color === "all" || g.color === color) &&
      (tc === "all" || g.time_class === tc) &&
      (!q || `${g.opening} ${g.opponent}`.toLowerCase().includes(q.toLowerCase())),
  );

  if (isLoading) return <Skeleton className="h-72 w-full" />;
  if (!games.length) return <Empty>No games imported yet.</Empty>;

  return (
    <section>
      {/* Filters in one row above the list */}
      <div className="flex flex-wrap items-center gap-4 pb-4 border-b-[2.5px] border-ink">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search opening or opponent"
          className="flex-1 min-w-48 bg-transparent border-b border-hair focus:border-accent outline-none py-1.5"
        />
        <Select label="Result" value={result} options={["all", "win", "draw", "loss"]} onChange={setResult} />
        <Select label="Color" value={color} options={["all", "white", "black"]} onChange={setColor} />
        <Select label="Type" value={tc} options={timeClasses} onChange={setTc} />
        <span className="label">{rows.length} games</span>
      </div>

      <ul>
        {rows.map((g) => (
          <li key={g.id}>
            <Link
              href={`/game?id=${g.id}&u=${encodeURIComponent(username)}`}
              className="row-hover grid grid-cols-[1fr_auto] sm:grid-cols-[88px_1fr_auto_auto] gap-x-5 gap-y-1 items-center px-3 py-4 border-b border-hair"
            >
              <span className="label hidden sm:block">{g.end_time.slice(0, 10)}</span>
              <span className="min-w-0">
                <b className="font-semibold">
                  vs {g.opponent} <span className="font-mono text-sm text-muted">({g.opponent_rating})</span>
                </b>
                <span className="block text-sm text-muted truncate">
                  {g.opening ?? "Unknown opening"} · <span className="capitalize">{g.time_class}</span> · as {g.color}
                </span>
              </span>
              <span className="inline-flex items-center gap-2 font-mono uppercase text-sm">
                <span className="inline-block size-2.5 rounded-full" style={{ background: RESULT_DOT[g.result] }} aria-hidden />
                {g.result}
              </span>
              <span className="hidden sm:block font-mono text-sm text-right w-24">
                {g.analysis_status === "done" ? `${num(g.accuracy)} acc` : <span className="text-muted">{g.analysis_status}</span>}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
