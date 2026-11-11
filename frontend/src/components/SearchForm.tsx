"use client";

import clsx from "clsx";
import { ArrowRight, LoaderCircle } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useEffect, useState, useTransition } from "react";
import { api, DEMO_PLAYER } from "@/lib/api";

const EXAMPLES = ["hikaru", "magnuscarlsen", "gothamchess", "danielnaroditsky", "your username"];

export function SearchForm() {
  const router = useRouter();
  const reduce = useReducedMotion();
  const [name, setName] = useState("");
  const [example, setExample] = useState(0);
  const [pending, startTransition] = useTransition();

  // The free-tier server sleeps when idle; start waking it as soon as someone lands here.
  useEffect(() => {
    api.health().catch(() => {});
  }, []);

  // Rotate the example name while the field is empty.
  useEffect(() => {
    if (name || reduce) return;
    const id = setInterval(() => setExample((i) => (i + 1) % EXAMPLES.length), 2600);
    return () => clearInterval(id);
  }, [name, reduce]);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const n = name.trim();
    if (n) startTransition(() => router.push(`/player?u=${encodeURIComponent(n)}`));
  }

  const ready = !!name.trim();

  return (
    <form onSubmit={submit} className="flex flex-col gap-3 sm:min-w-[380px]">
      <label htmlFor="username" className="label">
        Chess.com username
      </label>
      <div className="group relative flex items-center border-b-[2.5px] border-ink focus-within:border-accent transition-colors">
        {/* animated placeholder; the input keeps a real placeholder for assistive tech */}
        {!name && (
          <span
            aria-hidden
            className="pointer-events-none absolute left-0 top-1/2 -translate-y-1/2 h-[1.3em] overflow-hidden font-display font-extrabold text-3xl text-hovermuted"
          >
            <AnimatePresence mode="popLayout" initial={false}>
              <motion.span
                key={example}
                className="block"
                initial={{ y: "100%", opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                exit={{ y: "-100%", opacity: 0 }}
                transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
              >
                e.g. {EXAMPLES[example]}
              </motion.span>
            </AnimatePresence>
          </span>
        )}
        <input
          id="username"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. hikaru"
          autoComplete="off"
          spellCheck={false}
          className="relative flex-1 min-w-0 bg-transparent py-2 font-display font-extrabold text-3xl outline-none placeholder:text-transparent"
        />
        <button
          type="submit"
          aria-label="Analyze"
          disabled={!ready || pending}
          className={clsx(
            "grid place-items-center size-11 shrink-0 rounded-full transition-all duration-300",
            ready ? "bg-accent text-on-accent scale-100 shadow-[0_8px_30px_-8px_var(--accent)] hover:scale-105" : "text-ink/50 scale-90",
          )}
        >
          {pending ? (
            <LoaderCircle size={22} className="animate-spin" />
          ) : (
            <ArrowRight size={24} className="transition-transform duration-300 group-focus-within:translate-x-0.5" />
          )}
        </button>
      </div>
      <span className="text-sm text-muted">
        Or try the{" "}
        <Link href={`/player?u=${DEMO_PLAYER}`} className="link-underline text-accent font-semibold">
          demo
        </Link>
        .
      </span>
    </form>
  );
}
