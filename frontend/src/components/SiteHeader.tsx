"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import clsx from "clsx";
import { ThemeToggle } from "./ThemeToggle";
import { DEMO_PLAYER } from "@/lib/api";

const LINKS = [
  { href: "/", label: "Search", match: (p: string) => p === "/" },
  { href: `/player?u=${DEMO_PLAYER}`, label: "Demo", match: (p: string) => p.startsWith("/player") || p.startsWith("/game") },
];

export function SiteHeader() {
  const pathname = usePathname();
  return (
    <header className="border-b border-accent/60">
      <div className="wrap flex flex-wrap items-center justify-between gap-y-1 min-h-[58px] py-2">
        <span className="label">
          <a href="https://maxwellrobbins.com" className="hover:text-accent">
            maxwellrobbins.com
          </a>{" "}
          / <span className="text-accent">♚</span> <span className="text-ink">chessiq</span>
        </span>
        <nav className="flex items-center gap-5 sm:gap-6 text-[14.5px] font-semibold">
          {LINKS.map((l) => (
            <Link
              key={l.label}
              href={l.href}
              className={clsx(
                "hover:text-accent border-b-2 pb-0.5",
                l.match(pathname) ? "border-accent" : "border-transparent",
              )}
            >
              {l.label}
            </Link>
          ))}
          <a href="https://maxwellrobbins.com" className="hover:text-accent border-b-2 border-transparent pb-0.5">
            Portfolio ↗
          </a>
          <ThemeToggle />
        </nav>
      </div>
    </header>
  );
}
