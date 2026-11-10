"use client";

import { ArrowRight } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";

export function SearchForm() {
  const router = useRouter();
  const [name, setName] = useState("");

  // The free-tier server sleeps when idle; start waking it as soon as someone lands here.
  useEffect(() => {
    api.health().catch(() => {});
  }, []);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const n = name.trim();
    if (n) router.push(`/player?u=${encodeURIComponent(n)}`);
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-3 sm:min-w-[380px]">
      <label htmlFor="username" className="label">
        Chess.com username
      </label>
      <div className="flex items-center border-b-[2.5px] border-ink focus-within:border-accent">
        <input
          id="username"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. hikaru"
          autoComplete="off"
          spellCheck={false}
          className="flex-1 min-w-0 bg-transparent py-2 font-display font-extrabold text-3xl outline-none placeholder:text-hovermuted"
        />
        <button type="submit" aria-label="Analyze" className="p-2 hover:text-accent disabled:opacity-40" disabled={!name.trim()}>
          <ArrowRight size={28} />
        </button>
      </div>
      <span className="text-sm text-muted">
        Or try the{" "}
        <Link href="/player?u=bestplayerduck" className="text-accent font-semibold hover:underline">
          demo player
        </Link>
        .
      </span>
    </form>
  );
}
