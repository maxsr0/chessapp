// Stockfish 17.1 (full NNUE, single-threaded WebAssembly) running in a Web Worker.
// It is the same engine and network as the server's native 17.1. With the same settings
// (Threads 1, Hash 64, fixed depth, "position ... moves ...") it returns identical evals.
// The worker keeps the page responsive and uses one CPU core.
import { asset } from "@/lib/paths";

export const ENGINE_URL = asset("/engine/stockfish-17.1-single.js");
const MATE_SCORE = 10000; // must match backend/app/analysis.py

export interface Eval {
  cp: number; // side-to-move POV; mate in N = ±(10000 − N), like python-chess score(mate_score=10000)
  best: string; // UCI
}

export class BrowserEngine {
  private worker: Worker;
  private listeners = new Set<(line: string) => void>();

  private constructor(worker: Worker) {
    this.worker = worker;
    worker.onmessage = (e: MessageEvent) => {
      const line = typeof e.data === "string" ? e.data : String(e.data);
      for (const l of [...this.listeners]) l(line);
    };
  }

  /** Spawns the worker and waits for the engine. The first call downloads ~79 MB (then HTTP-cached). */
  static async start(hashMb: number): Promise<BrowserEngine> {
    const engine = new BrowserEngine(new Worker(ENGINE_URL));
    await engine.until("uci", (l) => l === "uciok");
    engine.send("setoption name Threads value 1");
    engine.send(`setoption name Hash value ${hashMb}`);
    await engine.newGame();
    return engine;
  }

  private send(cmd: string) {
    this.worker.postMessage(cmd);
  }

  /** Sends cmd and resolves with every line up to and including the one matching done. */
  private until(cmd: string, done: (line: string) => boolean): Promise<string[]> {
    return new Promise((resolve, reject) => {
      const lines: string[] = [];
      const onLine = (l: string) => {
        lines.push(l);
        if (done(l)) {
          this.listeners.delete(onLine);
          this.worker.removeEventListener("error", onError);
          resolve(lines);
        }
      };
      const onError = (e: ErrorEvent) => {
        this.listeners.delete(onLine);
        reject(new Error(e.message || "Engine failed to load"));
      };
      this.listeners.add(onLine);
      this.worker.addEventListener("error", onError, { once: true });
      this.send(cmd);
    });
  }

  /** Clears the hash before each game, like the server (python-chess sends ucinewgame per game). */
  async newGame() {
    this.send("ucinewgame");
    await this.until("isready", (l) => l === "readyok");
  }

  /** Evaluates start position + moves at a fixed depth, like python-chess engine.analyse(). */
  async evaluate(startFen: string, moves: string[], depth: number): Promise<Eval> {
    this.send(`position fen ${startFen}${moves.length ? " moves " + moves.join(" ") : ""}`);
    const lines = await this.until(`go depth ${depth}`, (l) => l.startsWith("bestmove"));
    let cp: number | null = null;
    let pv: string | null = null;
    for (const l of lines) {
      if (!l.startsWith("info ")) continue;
      const t = l.split(" ");
      const s = t.indexOf("score");
      if (s >= 0) {
        const v = Number(t[s + 2]);
        // python-chess: Mate(n).score(mate_score=M) = M − n for n > 0, −M − n for n < 0
        cp = t[s + 1] === "mate" ? (v > 0 ? MATE_SCORE - v : -MATE_SCORE - v) : v;
      }
      const p = t.indexOf("pv");
      if (p >= 0 && t[p + 1]) pv = t[p + 1];
    }
    const best = pv ?? lines[lines.length - 1].split(" ")[1];
    if (cp === null || !best || best === "(none)") throw new Error("Engine returned no evaluation");
    return { cp, best };
  }

  /** Aborts a running search; the pending evaluate() resolves on the resulting bestmove. */
  stop() {
    this.send("stop");
  }

  terminate() {
    this.listeners.clear();
    this.worker.terminate();
  }
}

/**
 * Whether this visitor should run the engine. That means a desktop-class machine on a normal
 * connection. Phones, data-saver connections, and low-memory or low-core devices stay on the
 * server queue.
 */
export function browserEngineAllowed(): boolean {
  if (typeof window === "undefined" || typeof Worker === "undefined" || typeof WebAssembly === "undefined") return false;
  const nav = navigator as Navigator & {
    connection?: { saveData?: boolean; effectiveType?: string };
    deviceMemory?: number;
    userAgentData?: { mobile?: boolean };
  };
  if (nav.userAgentData?.mobile) return false;
  if (window.matchMedia?.("(pointer: coarse)").matches && !window.matchMedia("(any-pointer: fine)").matches) return false;
  if (nav.connection?.saveData) return false;
  if (nav.connection?.effectiveType && /(^|-)2g|3g/.test(nav.connection.effectiveType)) return false;
  if (nav.deviceMemory !== undefined && nav.deviceMemory < 4) return false;
  if ((nav.hardwareConcurrency ?? 4) < 4) return false;
  return true;
}
