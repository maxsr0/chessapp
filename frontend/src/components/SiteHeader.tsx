"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import clsx from "clsx";
import { motion, useMotionValueEvent, useScroll } from "motion/react";
import { useState } from "react";
import { ThemeToggle } from "./ThemeToggle";
import { DEMO_PLAYER } from "@/lib/api";

const LINKS = [
  { href: "/", label: "Search", match: (p: string) => p === "/" },
  { href: `/player?u=${DEMO_PLAYER}`, label: "Demo", match: (p: string) => p.startsWith("/player") || p.startsWith("/game") },
];

export function SiteHeader() {
  const pathname = usePathname();
  const { scrollY } = useScroll();
  const [scrolled, setScrolled] = useState(false);
  useMotionValueEvent(scrollY, "change", (y) => setScrolled(y > 8));

  return (
    <header
      className={clsx(
        "sticky top-0 z-50 border-b transition-[background-color,border-color,backdrop-filter] duration-300",
        scrolled ? "bg-paper/75 backdrop-blur-md border-accent/60" : "bg-transparent border-accent/40",
      )}
    >
      <div className="wrap flex items-center justify-between gap-4 h-[58px]">
        <span className="label truncate">
          <a href="https://maxwellrobbins.com" className="hidden sm:inline hover:text-accent transition-colors">
            maxwellrobbins.com /{" "}
          </a>
          <Link href="/" className="group inline-flex items-center gap-1.5">
            <span className="text-accent inline-block transition-transform duration-300 group-hover:-translate-y-0.5 group-hover:rotate-[-8deg]">
              ♚
            </span>
            <span className="text-ink">chessiq</span>
          </Link>
        </span>
        <nav className="flex items-center gap-4 sm:gap-6 text-[14.5px] font-semibold">
          {LINKS.map((l) => {
            const active = l.match(pathname);
            return (
              <Link key={l.label} href={l.href} className="relative py-1 hover:text-accent transition-colors">
                {l.label}
                {active && (
                  <motion.span
                    layoutId="nav-underline"
                    className="absolute inset-x-0 -bottom-0.5 h-[2px] rounded-full bg-accent"
                    transition={{ type: "spring", stiffness: 500, damping: 38 }}
                  />
                )}
              </Link>
            );
          })}
          <a href="https://maxwellrobbins.com" className="hidden sm:inline py-1 hover:text-accent transition-colors">
            Portfolio ↗
          </a>
          <ThemeToggle />
        </nav>
      </div>
    </header>
  );
}
