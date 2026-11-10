"use client";

import clsx from "clsx";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { Empty } from "@/components/ui";
import { SyncBar } from "./SyncBar";
import { OverviewTab } from "./OverviewTab";
import { OpeningsTab } from "./OpeningsTab";
import { WeaknessesTab } from "./WeaknessesTab";
import { StudyTab } from "./StudyTab";
import { GamesTab } from "./GamesTab";

const TABS = [
  { id: "overview", label: "Overview" },
  { id: "openings", label: "Openings" },
  { id: "weaknesses", label: "Weaknesses" },
  { id: "study", label: "Study plan" },
  { id: "games", label: "Games" },
] as const;
type TabId = (typeof TABS)[number]["id"];

export function PlayerView() {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const username = (params.get("u") ?? "").trim().toLowerCase();
  const tab = (TABS.find((t) => t.id === params.get("tab"))?.id ?? "overview") as TabId;

  const overview = useQuery({ queryKey: ["overview", username], queryFn: () => api.overview(username), enabled: !!username });

  if (!username) {
    return (
      <div className="wrap pt-12">
        <Empty>
          No player selected. <Link href="/" className="text-accent font-semibold">Search for one</Link>.
        </Empty>
      </div>
    );
  }

  function setTab(id: TabId) {
    const next = new URLSearchParams(params);
    next.set("tab", id);
    router.replace(`${pathname}?${next}`, { scroll: false });
  }

  const hasGames = (overview.data?.games ?? 0) > 0;

  return (
    <div className="wrap pt-10 sm:pt-14">
      <span className="label block mb-3">Player report</span>
      <div className="flex flex-wrap items-end justify-between gap-6 border-b border-ink pb-6">
        <h1 className="display text-[clamp(40px,8vw,104px)] leading-[0.92] break-all">{username}</h1>
        <a
          href={`https://www.chess.com/member/${username}`}
          target="_blank"
          rel="noreferrer"
          className="label hover:text-accent"
        >
          Chess.com profile ↗
        </a>
      </div>

      <SyncBar username={username} autoStart={overview.isSuccess && !hasGames} />

      {overview.isError ? (
        <Empty>{(overview.error as Error).message}</Empty>
      ) : (
        <>
          <nav className="flex gap-1 overflow-x-auto overflow-y-hidden [scrollbar-width:none] border-b border-hair -mx-4 px-4 sm:mx-0 sm:px-0" role="tablist">
            {TABS.map((t) => (
              <button
                key={t.id}
                role="tab"
                aria-selected={tab === t.id}
                onClick={() => setTab(t.id)}
                className={clsx(
                  "label whitespace-nowrap px-3 py-3 border-b-[2.5px] -mb-px transition-colors",
                  tab === t.id ? "border-accent !text-ink" : "border-transparent hover:!text-ink",
                )}
              >
                {t.label}
              </button>
            ))}
          </nav>
          <div className="pt-8">
            {tab === "overview" && <OverviewTab username={username} />}
            {tab === "openings" && <OpeningsTab username={username} />}
            {tab === "weaknesses" && <WeaknessesTab username={username} />}
            {tab === "study" && <StudyTab username={username} />}
            {tab === "games" && <GamesTab username={username} />}
          </div>
        </>
      )}
    </div>
  );
}
