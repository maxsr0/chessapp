import { Chess } from "chess.js";
import type { Classification, Tag } from "./api";

export const QUALITY: Record<Classification, { label: string; symbol: string; color: string }> = {
  best: { label: "Best", symbol: "!", color: "var(--q-best)" },
  good: { label: "Good", symbol: "", color: "var(--q-good)" },
  inaccuracy: { label: "Inaccuracy", symbol: "?!", color: "var(--q-inaccuracy)" },
  mistake: { label: "Mistake", symbol: "?", color: "var(--q-mistake)" },
  blunder: { label: "Blunder", symbol: "??", color: "var(--q-blunder)" },
};

export const TAG_LABEL: Record<Tag, string> = {
  hung_piece: "Hung a piece",
  allowed_fork: "Walked into a fork",
  allowed_mate: "Allowed mate",
  back_rank_mate: "Back-rank mate",
  missed_mate: "Missed a forced mate",
  time_trouble: "Low on clock",
};

export const TAG_HELP: Record<Tag, string> = {
  hung_piece: "Opponent's best reply won a piece that was undefended or taken by a cheaper piece.",
  allowed_fork: "Opponent's best reply attacked two of your valuable pieces at once.",
  allowed_mate: "Opponent's best reply was checkmate.",
  back_rank_mate: "Mated on your back rank by a rook or queen.",
  missed_mate: "You had a forced mate and the move threw it away.",
  time_trouble: "Made with under 10% of the starting time (or 20s) left.",
};

/** Convert a SAN move in a position to from/to squares (for drawing an arrow). */
export function sanToSquares(fen: string, san: string | null): { from: string; to: string } | null {
  if (!san) return null;
  try {
    const m = new Chess(fen).move(san);
    return { from: m.from, to: m.to };
  } catch {
    return null;
  }
}

export const sideToMove = (fen: string) => (fen.split(" ")[1] === "b" ? "black" : "white");

/** Centipawns from the mover's view -> White's view in pawns, clamped for graphing. */
export function whitePawns(evalCp: number, mover: "white" | "black"): number {
  const cp = mover === "white" ? evalCp : -evalCp;
  return Math.max(-10, Math.min(10, cp / 100));
}

export function formatEval(pawns: number, rawCp: number): string {
  if (Math.abs(rawCp) >= 9000) return `${rawCp > 0 ? "" : "-"}M${10000 - Math.abs(rawCp)}`;
  return (pawns > 0 ? "+" : "") + pawns.toFixed(1);
}
