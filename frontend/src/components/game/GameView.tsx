"use client";

import { Chess } from "chess.js";
import clsx from "clsx";
import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api, type Move } from "@/lib/api";
import { QUALITY, formatEval, sanToSquares, whitePawns } from "@/lib/chess";
import { Board } from "@/components/Board";
import { EvalChart } from "@/components/charts";
import { Empty, QualityBadge, Skeleton, num } from "@/components/ui";

export function GameView() {
  const params = useSearchParams();
  const id = Number(params.get("id"));
  const from = params.get("u");
  const startPly = Number(params.get("ply")) || 0;

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["moves", id],
    queryFn: () => api.moves(id),
    enabled: Number.isFinite(id) && id > 0,
  });

  if (!id) return <div className="wrap pt-12"><Empty>No game selected.</Empty></div>;
  if (isLoading) return <div className="wrap pt-12"><Skeleton className="h-96 w-full" /></div>;
  if (isError || !data) return <div className="wrap pt-12"><Empty>{(error as Error)?.message ?? "Game not found."}</Empty></div>;

  return <Review key={id} game={data.game} moves={data.moves} startIdx={Math.max(0, startPly - 1)} backTo={from} />;
}

function Review({ game, moves, startIdx, backTo }: { game: Awaited<ReturnType<typeof api.moves>>["game"]; moves: Move[]; startIdx: number; backTo: string | null }) {
  // idx = which move we're looking at, shown in the position *before* it was played,
  // so the played move and the engine's choice can be drawn side by side. idx === moves.length = final position.
  const [idx, setIdx] = useState(Math.min(startIdx, moves.length));
  const listRef = useRef<HTMLDivElement>(null);

  const finalFen = useMemo(() => {
    if (!moves.length) return new Chess().fen();
    const last = moves[moves.length - 1];
    const c = new Chess(last.fen_before);
    try {
      c.move(last.san);
    } catch {}
    return c.fen();
  }, [moves]);

  const evalData = useMemo(
    () =>
      moves.map((m) => {
        const pawns = whitePawns(m.eval_after, m.color);
        const whiteCp = m.color === "white" ? m.eval_after : -m.eval_after;
        return { ply: m.ply, pawns, label: formatEval(pawns, whiteCp), move: `${Math.ceil(m.ply / 2)}${m.color === "white" ? "." : "…"} ${m.san}` };
      }),
    [moves],
  );

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.target instanceof HTMLInputElement) return;
      if (e.key === "ArrowLeft") setIdx((i) => Math.max(0, i - 1));
      if (e.key === "ArrowRight") setIdx((i) => Math.min(moves.length, i + 1));
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [moves.length]);

  useEffect(() => {
    listRef.current?.querySelector(`[data-idx="${idx}"]`)?.scrollIntoView({ block: "nearest" });
  }, [idx]);

  const m: Move | undefined = moves[idx];
  const fen = m ? m.fen_before : finalFen;
  const played = m ? sanToSquares(m.fen_before, m.san) : null;
  const best = m && m.best_move && m.best_move !== m.san ? sanToSquares(m.fen_before, m.best_move) : null;
  const arrows = [
    ...(played ? [{ startSquare: played.from, endSquare: played.to, color: m!.classification === "best" || m!.classification === "good" ? "rgba(130,150,255,0.8)" : "rgba(208,59,59,0.85)" }] : []),
    ...(best && m!.classification !== "best" && m!.classification !== "good" ? [{ startSquare: best.from, endSquare: best.to, color: "rgba(12,163,12,0.85)" }] : []),
  ];

  const mine = moves.filter((x) => x.is_player);
  const counts = (["inaccuracy", "mistake", "blunder"] as const).map((c) => ({ c, n: mine.filter((x) => x.classification === c).length }));

  // pair moves into rows: 1. white black
  const rows: [Move | undefined, Move | undefined, number][] = [];
  for (let i = 0; i < moves.length; i += 2) rows.push([moves[i], moves[i + 1], i]);

  return (
    <div className="wrap pt-8 sm:pt-12">
      <div className="flex flex-wrap items-baseline justify-between gap-3 border-b border-ink pb-5 mb-8">
        <div>
          {backTo && (
            <Link href={`/player?u=${encodeURIComponent(backTo)}&tab=games`} className="label hover:text-accent">
              ← {backTo}&apos;s games
            </Link>
          )}
          <h1 className="display text-[clamp(28px,5vw,56px)] leading-none mt-2">
            vs {game.opponent}
          </h1>
          <span className="text-muted">
            {game.result.toUpperCase()} as {game.color} · {game.opening ?? "Unknown opening"} · {game.time_class} ·{" "}
            {game.end_time.slice(0, 10)}
          </span>
        </div>
        <div className="flex gap-6 items-baseline">
          <div className="text-right">
            <span className="label block">Your accuracy</span>
            <b className="font-display font-extrabold text-3xl">{num(game.accuracy)}</b>
          </div>
          <a href={game.url} target="_blank" rel="noreferrer" className="label hover:text-accent">
            Chess.com ↗
          </a>
        </div>
      </div>

      <div className="grid lg:grid-cols-[minmax(0,560px)_1fr] gap-8 items-start">
        <div>
          <Board id="review" fen={fen} orientation={game.color} arrows={arrows} />
          <div className="flex items-center justify-between mt-3">
            <div className="flex gap-1">
              {[
                { icon: ChevronsLeft, to: 0, label: "Start" },
                { icon: ChevronLeft, to: Math.max(0, idx - 1), label: "Previous move" },
                { icon: ChevronRight, to: Math.min(moves.length, idx + 1), label: "Next move" },
                { icon: ChevronsRight, to: moves.length, label: "End" },
              ].map(({ icon: Icon, to, label }) => (
                <button key={label} aria-label={label} onClick={() => setIdx(to)} className="p-2 border border-hair hover:border-ink">
                  <Icon size={18} />
                </button>
              ))}
            </div>
            <span className="label">← → keys</span>
          </div>
        </div>

        <div className="min-w-0 space-y-6">
          <div className="border border-hair p-4 min-h-[112px]" aria-live="polite">
            {m ? (
              <>
                <div className="flex items-center justify-between gap-3">
                  <b className="font-display font-extrabold text-xl">
                    {Math.ceil(m.ply / 2)}
                    {m.color === "white" ? "." : "…"} {m.san}
                  </b>
                  <QualityBadge c={m.classification} />
                </div>
                <p className="text-sm text-muted mt-1">
                  {m.is_player ? "Your move" : `${game.opponent}'s move`}
                  {m.win_drop >= 1 && ` · gave away ${m.win_drop.toFixed(0)}% win chance`}
                  {m.clock != null && ` · ${Math.floor(m.clock / 60)}:${String(Math.floor(m.clock % 60)).padStart(2, "0")} left`}
                </p>
                {best && m.classification !== "best" && m.classification !== "good" && (
                  <p className="text-sm mt-2">
                    <span className="inline-block size-2.5 rounded-full bg-[var(--q-best)] mr-1.5" aria-hidden />
                    Best was <b>{m.best_move}</b>
                  </p>
                )}
              </>
            ) : (
              <p className="text-muted">Final position · {game.result_detail}</p>
            )}
          </div>

          <div>
            <span className="label block mb-2">Evaluation (White&apos;s view) · click to jump</span>
            <EvalChart data={evalData} current={idx} onSelect={setIdx} />
          </div>

          <div className="flex gap-5 text-sm">
            {counts.map(({ c, n }) => (
              <span key={c} className="inline-flex items-center gap-1.5">
                <QualityBadge c={c} withLabel={false} /> {n} {QUALITY[c].label.toLowerCase()}
                {n === 1 ? "" : "s"}
              </span>
            ))}
          </div>

          <div ref={listRef} className="max-h-[360px] overflow-y-auto border-t border-ink">
            {rows.map(([w, b, i]) => (
              <div key={i} className="grid grid-cols-[44px_1fr_1fr] border-b border-hair text-sm">
                <span className="font-mono text-muted py-1.5 px-2">{i / 2 + 1}.</span>
                {[w, b].map((mv, j) =>
                  mv ? (
                    <button
                      key={j}
                      data-idx={i + j}
                      onClick={() => setIdx(i + j)}
                      className={clsx(
                        "text-left py-1.5 px-2 inline-flex items-center gap-2",
                        idx === i + j ? "bg-ink text-paper" : "hover:bg-hair/50",
                        mv.is_player && "font-semibold",
                      )}
                    >
                      <span className="inline-block size-2 rounded-full shrink-0" style={{ background: QUALITY[mv.classification].color }} aria-hidden />
                      {mv.san}
                      <span className="font-mono text-xs opacity-70">{QUALITY[mv.classification].symbol}</span>
                    </button>
                  ) : (
                    <span key={j} />
                  ),
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
