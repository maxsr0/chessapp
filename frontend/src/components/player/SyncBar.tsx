"use client";

import { RefreshCw } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { Segmented } from "@/components/motion";
import { useBrowserAnalysis } from "@/lib/useBrowserAnalysis";

const LIMITS = [25, 50, 100] as const;
const STAT_KEYS = ["overview", "openings", "weaknesses", "study", "games"];

/** Import + analyze controls, with live queue progress while the worker runs. */
export function SyncBar({ username, autoStart }: { username: string; autoStart: boolean }) {
  const qc = useQueryClient();
  const [limit, setLimit] = useState<(typeof LIMITS)[number]>(50);
  const autoStarted = useRef(false);

  const status = useQuery({
    queryKey: ["status", username],
    queryFn: () => api.status(username),
    refetchInterval: (q) => (q.state.data?.running ? 3000 : false),
  });
  const browser = useBrowserAnalysis(username, (status.data?.counts.queued ?? 0) > 0);

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
  const remaining = (counts.queued ?? 0) + (counts.analyzing ?? 0);
  const ahead = status.data?.games_ahead ?? 0;
  const progress = total ? done / total : 0;

  let message: string;
  if (sync.isPending) message = "Fetching games from Chess.com…";
  else if (sync.isError) message = (sync.error as Error).message;
  else if (running && browser === "loading")
    message = "Loading Stockfish in your browser (one-time download, then it's cached)…";
  else if (running && browser === "analyzing")
    message = `Analyzing with Stockfish on this device: ${done} of ${total} games done, ${remaining} to go`;
  else if (running)
    message =
      ahead > 0
        ? `Taking turns with ${ahead} other player${ahead === 1 ? "" : "s"}: your first game starts shortly`
        : `Analyzing with Stockfish: ${done} of ${total} games done, ${remaining} to go`;
  else if (total) message = `${done} games analyzed${counts.error ? `, ${counts.error} failed` : ""}`;
  else message = "No games imported yet";

  return (
    <div className="py-5 border-b border-hair">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <p className="text-sm" role="status" aria-live="polite">
          <span className={sync.isError ? "text-[var(--q-blunder)]" : "text-body"}>{message}</span>
        </p>
        <div className="flex items-center gap-3">
          <Segmented label="Games" value={limit} options={LIMITS} onChange={setLimit} disabled={sync.isPending || running} />
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
