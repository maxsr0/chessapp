"use client";

import { Chess } from "chess.js";
import Link from "next/link";
import { Suspense, use, useState } from "react";
import { browser } from "react-dom";
import { useQuery } from "@tanstack/react-query";
import { api, type Blunder } from "@/lib/api";
import { TAG_LABEL, sanToSquares, sideToMove } from "@/lib/chess";
import { Board } from "@/components/Board";
import { Empty, SectionHead, Skeleton } from "@/components/ui";

const strip = (s: string | null) => (s ?? "").replace(/[+#!?]/g, "");

type Score = { right: number; tried: number };

/** Score lives in localStorage, so callers must render inside a browser-only boundary. */
function useScore(username: string) {
  use(browser("Puzzle score is stored in localStorage."));
  const key = `chessiq-score-${username}`;
  const [score, setScore] = useState<Score>(() => {
    try {
      return JSON.parse(localStorage.getItem(key) ?? "null") ?? { right: 0, tried: 0 };
    } catch {
      return { right: 0, tried: 0 };
    }
  });
  function record(correct: boolean) {
    setScore((s) => {
      const next = { right: s.right + (correct ? 1 : 0), tried: s.tried + 1 };
      try {
        localStorage.setItem(key, JSON.stringify(next));
      } catch {}
      return next;
    });
  }
  return [score, record] as const;
}

function Puzzle({ p, onNext, record, username }: { p: Blunder; onNext: () => void; record: (ok: boolean) => void; username: string }) {
  const [fen, setFen] = useState(p.fen_before);
  const [state, setState] = useState<"solving" | "wrong" | "solved" | "revealed">("solving");
  const [tried, setTried] = useState(false);
  const [lastWrong, setLastWrong] = useState<string | null>(null);

  function onMove(from: string, to: string) {
    if (state === "solved" || state === "revealed") return false;
    const game = new Chess(p.fen_before);
    let move;
    try {
      move = game.move({ from, to, promotion: "q" });
    } catch {
      return false; // illegal: piece snaps back
    }
    const correct = strip(move.san) === strip(p.best_move);
    if (!tried) {
      record(correct);
      setTried(true);
    }
    if (correct) {
      setFen(game.fen());
      setState("solved");
      return true;
    }
    setLastWrong(move.san);
    setState("wrong");
    return false;
  }

  const best = state === "revealed" ? sanToSquares(p.fen_before, p.best_move) : null;
  const side = sideToMove(p.fen_before);

  return (
    <div className="grid md:grid-cols-[minmax(0,480px)_1fr] gap-8 items-start">
      <div className="w-full max-w-[480px]">
        <Board
          id="puzzle"
          fen={fen}
          orientation={side}
          draggable={state === "solving" || state === "wrong"}
          onMove={onMove}
          arrows={best ? [{ startSquare: best.from, endSquare: best.to, color: "rgba(12,163,12,0.85)" }] : []}
        />
      </div>
      <div>
        <span className="label block mb-2">
          {p.phase} · {p.opening ?? "Unknown opening"}
        </span>
        <p className="font-display font-extrabold text-2xl tracking-tight mb-2">
          {side === "white" ? "White" : "Black"} to move. Find the best move.
        </p>
        <p className="text-muted mb-6">
          In the game you played <b className="text-ink">{p.san}</b> here and gave away {p.win_drop.toFixed(0)}% win chance.
          {p.tags.length > 0 && <> Pattern: {p.tags.map((t) => TAG_LABEL[t]).join(", ")}.</>}
        </p>

        <div aria-live="polite" className="min-h-[3.5rem] mb-6">
          {state === "solved" && (
            <p className="text-[var(--q-best)] font-semibold">✓ Correct! {p.best_move} is the engine&apos;s move.</p>
          )}
          {state === "wrong" && (
            <p>
              <span className="text-[var(--q-blunder)] font-semibold">✗ {lastWrong} isn&apos;t it.</span>{" "}
              <span className="text-muted">Try again, or reveal the answer.</span>
            </p>
          )}
          {state === "revealed" && (
            <p>
              The best move was <b className="text-[var(--q-best)]">{p.best_move}</b> (green arrow).
            </p>
          )}
        </div>

        <div className="flex flex-wrap gap-3">
          {state !== "solved" && state !== "revealed" && (
            <button
              className="btn"
              onClick={() => {
                if (!tried) {
                  record(false);
                  setTried(true);
                }
                setState("revealed");
              }}
            >
              Reveal
            </button>
          )}
          <button className="btn btn-primary" onClick={onNext}>
            Next puzzle →
          </button>
          <Link href={`/game?id=${p.game_id}&ply=${p.ply}&u=${encodeURIComponent(username)}`} className="btn">
            Open game
          </Link>
        </div>
      </div>
    </div>
  );
}

function PuzzleSection({ puzzles, username }: { puzzles: Blunder[]; username: string }) {
  const [idx, setIdx] = useState(0);
  const [score, record] = useScore(username);
  const p = puzzles[idx % Math.max(puzzles.length, 1)];
  return (
    <section>
      <SectionHead
        title="Puzzles from your games"
        caption={`${puzzles.length ? (idx % puzzles.length) + 1 : 0} / ${puzzles.length} · score ${score.right}/${score.tried}`}
      />
      <div className="pt-6">
        {p ? (
          <Puzzle key={`${p.game_id}-${p.ply}`} p={p} username={username} record={record} onNext={() => setIdx((i) => i + 1)} />
        ) : (
          <Empty>No puzzles yet.</Empty>
        )}
      </div>
      <p className="text-sm text-muted mt-6">
        Drag a piece to make your move. Each position is one where you went wrong, but weren&apos;t already lost.
      </p>
    </section>
  );
}

export function StudyTab({ username }: { username: string }) {
  const { data, isLoading } = useQuery({ queryKey: ["study", username], queryFn: () => api.studyPlan(username) });

  if (isLoading) return <Skeleton className="h-72 w-full" />;
  if (!data?.priorities.length) return <Empty>Your study plan appears once some games are analyzed.</Empty>;

  return (
    <div className="space-y-14">
      <section>
        <SectionHead title="Your priorities" caption="Ranked by how much they cost you" />
        {data.priorities.map((item) => (
          <div key={item.rank} className="grid grid-cols-[40px_1fr] sm:grid-cols-[64px_1fr] gap-4 items-baseline px-3 py-5 border-b border-hair">
            <span className="font-mono text-[13px] text-muted">{String(item.rank).padStart(3, "0")}</span>
            <div>
              <b className="block font-display font-extrabold text-[clamp(19px,2.4vw,25px)] leading-tight tracking-tight">{item.title}</b>
              <span className="text-muted">{item.detail}</span>
            </div>
          </div>
        ))}
      </section>

      <Suspense fallback={<Skeleton className="h-96 w-full" />}>
        <PuzzleSection puzzles={data.puzzles} username={username} />
      </Suspense>
    </div>
  );
}
