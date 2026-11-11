import { SearchForm } from "@/components/SearchForm";
import { SectionHead } from "@/components/ui";
import { HeroPiece } from "@/components/HeroPiece";
import { Reveal, SpotlightCard } from "@/components/motion";

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

const FACTS = [
  ["Engine", "Stockfish"],
  ["Grading", "Win-chance drop"],
  ["Puzzles", "From your games"],
];

export default function Home() {
  return (
    <>
      <section className="relative isolate overflow-hidden border-b border-accent/60">
        <HeroPiece className="relative h-[58svh] min-h-[360px] max-h-[620px] lg:absolute lg:inset-0 lg:h-auto lg:max-h-none max-lg:[mask-image:linear-gradient(to_bottom,#000_92%,transparent)]" />
        {/* keeps the copy legible where it overlaps the floor */}
        <div
          aria-hidden
          className="hidden lg:block absolute inset-y-0 left-0 w-[58%] bg-gradient-to-r from-paper via-paper/80 to-transparent pointer-events-none"
        />
        <div className="wrap relative z-10 -mt-2 lg:mt-0 pb-14 lg:py-24 lg:min-h-[min(860px,calc(100svh-59px))] flex items-center pointer-events-none">
          <div className="w-full min-w-0 max-w-[560px] pointer-events-auto">
            <div className="rise" style={{ "--d": "0.05s" } as React.CSSProperties}>
              <span className="label inline-flex items-center gap-2">
                <span className="size-1.5 rounded-full bg-accent animate-pulse" aria-hidden />
                Stockfish × Chess.com
              </span>
            </div>
            <div className="rise" style={{ "--d": "0.12s" } as React.CSSProperties}>
              <h1 className="mt-4 flex items-center gap-[0.18em] font-display font-black tracking-[-0.04em] leading-[0.9] text-[clamp(56px,9vw,124px)]">
                Chess
                <span className="rounded-[0.16em] bg-accent text-on-accent px-[0.2em] py-[0.06em] text-[0.6em] tracking-normal shadow-[0_10px_40px_-10px_var(--accent)]">
                  IQ
                </span>
              </h1>
            </div>
            <div className="rise" style={{ "--d": "0.2s" } as React.CSSProperties}>
              <p className="mt-6 font-display font-bold text-[clamp(22px,2.6vw,30px)] leading-tight text-ink max-w-[18em]">
                Find the mistakes you keep making.
              </p>
            </div>
            <div className="rise" style={{ "--d": "0.28s" } as React.CSSProperties}>
              <p className="mt-4 text-base sm:text-lg max-w-[30em] text-muted">
                Stockfish reviews your recent Chess.com games and shows which openings cost you, which phase you fall
                apart in, and which tactics you miss.
              </p>
            </div>
            <div className="rise mt-9" style={{ "--d": "0.36s" } as React.CSSProperties}>
              <SearchForm />
            </div>
            <div className="rise" style={{ "--d": "0.46s" } as React.CSSProperties}>
              <dl className="mt-10 grid grid-cols-3 max-w-[460px] border-t border-hair">
                {FACTS.map(([k, v]) => (
                  <div key={k} className="pt-3 pr-3">
                    <dt className="label !text-[10.5px]">{k}</dt>
                    <dd className="text-sm font-semibold text-body">{v}</dd>
                  </div>
                ))}
              </dl>
            </div>
          </div>
        </div>
      </section>

      <section className="wrap pt-20">
        <Reveal>
          <SectionHead title="How it works" caption="Four moves, about a minute" />
        </Reveal>
        <ol className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 mt-6 border border-hair">
          {STEPS.map((s, i) => {
            const dark = i % 2 === 0;
            return (
              <Reveal as="li" key={s.title} delay={i * 0.08}>
                <SpotlightCard
                  glow={dark ? "#f3efe4" : "var(--accent)"}
                  className={`h-full lg:aspect-square flex flex-col justify-end gap-2 p-5 sm:p-6 min-h-[200px] transition-transform duration-500 ease-out hover:-translate-y-1 ${
                    dark ? "bg-[var(--sq-dark)] text-[#f3efe4]" : "bg-[var(--sq-light)] text-[#13201a]"
                  }`}
                >
                  <span className="absolute top-3 left-4 font-mono text-[13px] opacity-70">{"abcd"[i]}1</span>
                  <span
                    aria-hidden
                    className="absolute top-2 right-4 font-display font-black text-[64px] leading-none opacity-[0.08] transition-opacity duration-500 group-hover:opacity-20"
                  >
                    {i + 1}
                  </span>
                  <b className="relative block font-display font-extrabold text-[clamp(21px,2.4vw,27px)] leading-tight tracking-tight">
                    {s.title}
                  </b>
                  <span className="relative text-[15px] leading-snug opacity-85">{s.body}</span>
                </SpotlightCard>
              </Reveal>
            );
          })}
        </ol>
      </section>
    </>
  );
}
