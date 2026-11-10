import { SearchForm } from "@/components/SearchForm";
import { SectionHead } from "@/components/ui";

const STEPS = [
  {
    title: "Import",
    body: "Pulls your most recent games from Chess.com's public API. No login, just a username.",
  },
  {
    title: "Analyze",
    body: "Stockfish evaluates every position. Moves are graded by how much win chance they gave away, the same way Lichess does it.",
  },
  {
    title: "Find patterns",
    body: "Your errors are tagged (hung pieces, forks, back-rank mates, time trouble) and grouped by phase, opening, and month.",
  },
  {
    title: "Train",
    body: "A study plan ranks your weaknesses, and the puzzles come from positions where you actually went wrong.",
  },
];

export default function Home() {
  return (
    <>
      <section className="wrap border-b border-ink pt-12 sm:pt-16">
        <span className="label block mb-5">Stockfish analysis for Chess.com players</span>
        <h1 className="display text-[clamp(64px,14vw,176px)] leading-[0.9] select-none">
          <span className="block">Chess</span>
          <span className="block outline-text">IQ</span>
        </h1>
        <div className="flex flex-wrap items-end justify-between gap-8 py-8 sm:py-10">
          <p className="text-lg sm:text-xl max-w-[30em] text-body">
            Enter a Chess.com username. ChessIQ analyzes your recent games and shows the mistakes you keep making: which
            openings cost you, which phase you fall apart in, and what kind of tactics you miss.
          </p>
          <div className="w-full sm:w-auto">
            <SearchForm />
          </div>
        </div>
      </section>

      <section className="wrap pt-16">
        <SectionHead title="How it works" caption="Four steps, about a minute" />
        {STEPS.map((s, i) => (
          <div
            key={s.title}
            className="grid grid-cols-[40px_1fr] sm:grid-cols-[64px_1fr] gap-4 items-baseline px-3 py-6 border-b border-hair"
          >
            <span className="font-mono text-[13px] text-muted">{String(i + 1).padStart(3, "0")}</span>
            <div>
              <b className="block font-display font-extrabold text-[clamp(21px,2.8vw,29px)] leading-tight tracking-tight">
                {s.title}
              </b>
              <span className="text-muted">{s.body}</span>
            </div>
          </div>
        ))}
      </section>
    </>
  );
}
