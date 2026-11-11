"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { api, type ClientWork } from "@/lib/api";
import { BrowserEngine, browserEngineAllowed } from "@/lib/browserEngine";

export type BrowserAnalysisState = "off" | "loading" | "analyzing" | "idle";

const HASH_MB = 64; // must match open_engine() in backend/app/analysis.py

const subscribeVisibility = (cb: () => void) => {
  document.addEventListener("visibilitychange", cb);
  return () => document.removeEventListener("visibilitychange", cb);
};

/**
 * While this player has queued games, analyze them on this machine with the same Stockfish
 * build as the server, one game at a time. The server keeps working alongside.
 *
 * The rules that keep it painless:
 * - The engine downloads only on a player page with work queued, and only on capable desktops
 *   (see browserEngineAllowed). Everyone else just uses the server queue.
 * - It runs in a Web Worker on one core, so the page stays responsive.
 * - It pauses when the tab is hidden. An unfinished game goes back to the server, on hide and on
 *   close (keepalive request), and a lease timeout covers anything missed.
 * - Any failure quietly falls back to the server.
 */
export function useBrowserAnalysis(username: string, hasQueued: boolean): BrowserAnalysisState {
  const [state, setState] = useState<BrowserAnalysisState>("off");
  const visible = useSyncExternalStore(
    subscribeVisibility,
    () => document.visibilityState === "visible",
    () => false,
  );
  const engine = useRef<Promise<BrowserEngine> | null>(null);
  const broken = useRef(false);
  const current = useRef<ClientWork | null>(null);
  const previousRun = useRef<Promise<void>>(Promise.resolve());

  // Tear the worker down when leaving the page, and give back any in-flight game.
  useEffect(() => {
    const release = () => {
      if (current.current) api.clientRelease(current.current);
      current.current = null;
    };
    window.addEventListener("pagehide", release);
    return () => {
      window.removeEventListener("pagehide", release);
      release();
      engine.current?.then((e) => e.terminate()).catch(() => {});
      engine.current = null;
    };
  }, []);

  useEffect(() => {
    if (!hasQueued || !visible || broken.current || !browserEngineAllowed()) return;
    let cancelled = false;
    let sf: BrowserEngine | null = null;

    const run = async () => {
      await previousRun.current; // never two loops driving one engine
      if (cancelled) return;
      try {
        if (!engine.current) {
          setState("loading");
          engine.current = BrowserEngine.start(HASH_MB);
        }
        sf = await engine.current;
      } catch {
        broken.current = true; // e.g. no WebAssembly memory; leave it to the server
        engine.current = null;
        setState("off");
        return;
      }
      setState("idle");
      while (!cancelled) {
        let work: ClientWork | null;
        try {
          work = await api.clientClaim(username);
        } catch {
          break; // server unreachable or rate-limited; try again on the next status change
        }
        if (!work) break;
        current.current = work;
        setState("analyzing");
        try {
          await sf.newGame();
          const evals: ({ cp: number; best: string } | null)[] = [];
          for (let i = 0; i < work.positions.length; i++) {
            if (cancelled) break;
            const p = work.positions[i];
            if (p.terminal) evals.push(null);
            else evals.push(await sf.evaluate(work.start_fen, work.moves.slice(0, i), work.depth));
          }
          if (cancelled) break; // cleanup below releases it
          current.current = null;
          await api.clientResult(work, evals);
        } catch {
          // a 409 (lease expired) or 422 (rejected) leaves the game with the server; move on
          if (current.current) api.clientRelease(current.current);
          current.current = null;
        }
      }
      if (current.current) {
        api.clientRelease(current.current);
        current.current = null;
      }
      if (!cancelled) setState("idle");
    };

    const p = run();
    previousRun.current = p.catch(() => {});
    return () => {
      cancelled = true;
      sf?.stop(); // ends the current search right away; its result is discarded
      setState((s) => (s === "off" ? s : "idle"));
    };
  }, [hasQueued, visible, username]);

  return state;
}
