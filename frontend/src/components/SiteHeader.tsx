import Link from "next/link";
import { ThemeToggle } from "./ThemeToggle";

export function SiteHeader() {
  return (
    <header className="border-b border-ink">
      <div className="wrap flex flex-wrap items-center justify-between gap-y-1 min-h-[58px] py-2">
        <span className="label">
          <a href="https://maxwellrobbins.com" className="hover:text-accent">
            maxwellrobbins.com
          </a>{" "}
          / chessiq
        </span>
        <nav className="flex items-center gap-5 sm:gap-6 text-[14.5px] font-semibold">
          <Link href="/" className="hover:text-accent">
            Search
          </Link>
          <Link href="/player?u=bestplayerduck" className="hover:text-accent">
            Demo
          </Link>
          <a href="https://maxwellrobbins.com" className="hover:text-accent">
            Portfolio
          </a>
          <ThemeToggle />
        </nav>
      </div>
    </header>
  );
}
