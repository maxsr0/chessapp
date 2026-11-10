// Typed client for the FastAPI backend (backend/app/main.py).
export const API_URL = (process.env.NEXT_PUBLIC_API_URL ?? "http://127.0.0.1:8000").replace(/\/$/, "");

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(API_URL + path, init);
  } catch {
    throw new ApiError(0, "Can't reach the analysis server. It may be waking up; try again in a moment.");
  }
  if (!res.ok) {
    let msg = res.statusText;
    try {
      const body = await res.json();
      msg = typeof body.detail === "string" ? body.detail : body.error ?? msg;
    } catch {}
    if (res.status === 429) msg = "Too many requests. Wait a minute and try again.";
    throw new ApiError(res.status, msg);
  }
  return res.json() as Promise<T>;
}

export type Classification = "best" | "good" | "inaccuracy" | "mistake" | "blunder";
export type Phase = "opening" | "middlegame" | "endgame";
export type Tag = "hung_piece" | "allowed_fork" | "allowed_mate" | "back_rank_mate" | "missed_mate" | "time_trouble";

export interface Game {
  id: number;
  url: string;
  username: string;
  color: "white" | "black";
  result: "win" | "draw" | "loss";
  result_detail: string;
  player_rating: number;
  opponent: string;
  opponent_rating: number;
  time_class: string;
  time_control: string;
  rated: boolean;
  end_time: string;
  opening: string | null;
  analysis_status: "pending" | "queued" | "done" | "error";
  accuracy: number | null;
}

export interface Move {
  ply: number;
  color: "white" | "black";
  is_player: boolean;
  san: string;
  uci: string;
  fen_before: string;
  eval_before: number;
  eval_after: number;
  win_drop: number;
  accuracy: number;
  classification: Classification;
  best_move: string | null;
  clock: number | null;
}

type WinRow = { games: number; win_rate: number; accuracy: number | null };

export interface Overview {
  games: number;
  results?: Partial<Record<"win" | "draw" | "loss", number>>;
  win_rate?: number;
  avg_accuracy?: number | null;
  classification_counts?: Partial<Record<Classification, number>>;
  rating_history?: { end_time: string; time_class: string; player_rating: number }[];
  by_month?: ({ month: string; blunders_per_game?: number } & WinRow)[];
  by_time_class?: ({ time_class: string } & WinRow)[];
  by_rating_diff?: ({ rating_diff: string } & WinRow)[];
  by_hour?: ({ hour: string } & WinRow)[];
}

export interface OpeningRow {
  opening: string;
  color: "white" | "black";
  games: number;
  wins: number;
  draws: number;
  losses: number;
  accuracy: number | null;
  win_rate: number;
  opening_errors_per_game?: number;
}

export interface Blunder {
  game_id: number;
  ply: number;
  san: string;
  best_move: string | null;
  win_drop: number;
  phase: Phase;
  opening: string | null;
  fen_before: string;
  tags: Tag[];
}

export interface Weaknesses {
  by_phase?: { phase: Phase; moves: number; errors: number; blunders: number; accuracy: number; errors_per_100_moves: number }[];
  tags?: Partial<Record<Tag, number>>;
  time_trouble?: { error_rate_low_clock: number | null; error_rate_normal: number | null };
  trend?: { month: string; moves: number; errors: number; accuracy: number; errors_per_100_moves: number }[];
  worst_blunders?: Blunder[];
}

export interface StudyPlan {
  priorities: { rank: number; title: string; detail: string }[];
  puzzles: Blunder[];
}

export interface QueueStatus {
  running: boolean;
  counts: Partial<Record<Game["analysis_status"], number>>;
  games_ahead: number;
}

const u = (name: string) => encodeURIComponent(name.trim().toLowerCase());

export const api = {
  health: () => request<{ status: string }>("/health"),
  sync: (name: string, limit = 50) =>
    request<{ fetched: number; added: number; queued: number }>(`/players/${u(name)}/sync?limit=${limit}`, {
      method: "POST",
    }),
  status: (name: string) => request<QueueStatus>(`/players/${u(name)}/analysis-status`),
  games: (name: string) => request<{ total: number; games: Game[] }>(`/players/${u(name)}/games?limit=500`),
  moves: (id: number) => request<{ game: Game; moves: Move[] }>(`/games/${id}/moves`),
  overview: (name: string) => request<Overview>(`/players/${u(name)}/stats/overview`),
  openings: (name: string) => request<OpeningRow[]>(`/players/${u(name)}/stats/openings?min_games=3`),
  weaknesses: (name: string) => request<Weaknesses>(`/players/${u(name)}/stats/weaknesses`),
  studyPlan: (name: string) => request<StudyPlan>(`/players/${u(name)}/study-plan`),
};
