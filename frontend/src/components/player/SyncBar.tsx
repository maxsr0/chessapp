"use client";

import { RefreshCw } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";

const STAT_KEYS = ["overview", "openings", "weaknesses", "study", "games"];

/** Import + analyze controls, with live queue progress while the worker runs. */
export function SyncBar({ username, autoStart }: { username: string; autoStart: boolean }) {
  const qc = useQueryClient();
  const [limit, setLimit] = useState(50);
  const autoStarted = useRef(false);

  const status = useQuery({
    queryKey: ["status", username],
    queryFn: () => api.status(username),
    refetchInterval: (q) => (q.state.data?.running ? 3000 : false),
  });

  const sync = useMutation({
    mutationFn: () => api.sync(username, limit),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["status", username] });
      qc.invalidateQueries({ queryKey: ["games", username] });
    },
  });

  // First visit for a player with no games yet: start automatically.
  useEffect(() => {
    if (autoStart && !autoStarted.current) {
      autoStarted.current = true;
      sync.mutate();
    }
  }, [autoStart, sync]);

  // As analyzed-game count grows, refresh stats every 5 finished games (and at the end).
  const done = status.data?.counts.done ?? 0;
  const running = status.data?.running ?? false;
  const lastRefresh = useRef(done);
  useEffect(() => {
    if (done - lastRefresh.current >= 5 || (!running && done !== lastRefresh.current)) {
      lastRefresh.current = done;
      for (const k of STAT_KEYS) qc.invalidateQueries({ queryKey: [k, username] });
    }
  }, [done, running, qc, username]);

  const counts = status.data?.counts ?? {};
  const total = Object.values(counts).reduce((a, b) => a + (b ?? 0), 0);
  const queued = counts.queued ?? 0;
  const ahead = status.data?.games_ahead ?? 0;
  const progress = total ? done / total : 0;

  let message: string;
  if (sync.isPending) message = "Fetching games from Chess.com…";
  else if (sync.isError) message = (sync.error as Error).message;
  else if (running)
    message =
      ahead > 0
        ? `Waiting in line: ${ahead} game${ahead === 1 ? "" : "s"} from other players ahead of yours`
        : `Analyzing with Stockfish: ${done} of ${total} games done, ${queued} to go`;
  else if (total) message = `${done} games analyzed${counts.error ? `, ${counts.error} failed` : ""}`;
  else message = "No games imported yet";

  return (
    <div className="py-5 border-b border-hair">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <p className="text-sm" role="status" aria-live="polite">
          <span className={sync.isError ? "text-[var(--q-blunder)]" : "text-body"}>{message}</span>
        </p>
        <div className="flex items-center gap-3">
          <label className="label flex items-center gap-2">
            Games
            <select
              value={limit}
              onChange={(e) => setLimit(Number(e.target.value))}
              className="bg-transparent border border-hair rounded px-1.5 py-1 font-mono text-ink"
            >
              {[25, 50, 100].map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </label>
          <button className="btn" onClick={() => sync.mutate()} disabled={sync.isPending || running}>
            <RefreshCw size={15} className={sync.isPending || running ? "animate-spin" : ""} />
            {total ? "Update" : "Import & analyze"}
          </button>
        </div>
      </div>
      {(running || sync.isPending) && (
        <div className="mt-4 h-1 bg-hair overflow-hidden" aria-hidden>
          <div
            className="h-full bg-accent transition-[width] duration-700"
            style={{ width: `${Math.max(sync.isPending ? 3 : 0, progress * 100)}%` }}
          />
        </div>
      )}
    </div>
  );
}
