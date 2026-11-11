import { SearchForm } from "@/components/SearchForm";
import { SectionHead } from "@/components/ui";
import { HeroPiece } from "@/components/HeroPiece";

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
      <section className="wrap border-b border-accent/60 pt-10 sm:pt-14 grid lg:grid-cols-[1fr_1.1fr] gap-x-10 items-center">
        <HeroPiece className="order-first lg:order-last h-[340px] sm:h-[440px] lg:h-[580px] lg:-mb-10 relative z-0" />
        <div className="relative z-10 py-8 sm:py-12">
          <h1 className="flex items-center gap-3 font-display font-extrabold tracking-[-0.03em] leading-none text-[clamp(44px,7vw,88px)]">
            Chess
            <span className="rounded-[0.18em] bg-accent text-on-accent px-[0.22em] py-[0.08em] text-[0.62em] tracking-normal">
              IQ
            </span>
          </h1>
          <p className="mt-6 font-display font-bold text-[clamp(22px,2.6vw,28px)] leading-tight text-body max-w-[18em]">
            Find the mistakes you keep making.
          </p>
          <p className="mt-4 text-base sm:text-lg max-w-[30em] text-muted">
            Stockfish reviews your recent Chess.com games and shows which openings cost you, which phase you fall
            apart in, and which tactics you miss.
          </p>
          <div className="mt-8 w-full sm:w-auto">
            <SearchForm />
          </div>
        </div>
      </section>

      <section className="wrap pt-16">
        <SectionHead title="How it works" caption="Four moves, about a minute" />
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 mt-6 border border-hair">
          {STEPS.map((s, i) => {
            const dark = i % 2 === 0;
            return (
              <div
                key={s.title}
                className={`relative lg:aspect-square flex flex-col justify-end gap-2 p-5 sm:p-6 min-h-[200px] ${
                  dark ? "bg-[var(--sq-dark)] text-[#f3efe4]" : "bg-[var(--sq-light)] text-[#13201a]"
                }`}
              >
                <span className="absolute top-3 left-4 font-mono text-[13px] opacity-70">{"abcd"[i]}1</span>
                <b className="block font-display font-extrabold text-[clamp(21px,2.4vw,27px)] leading-tight tracking-tight">
                  {s.title}
                </b>
                <span className="text-[15px] leading-snug opacity-85">{s.body}</span>
              </div>
            );
          })}
        </div>
      </section>
    </>
  );
}
