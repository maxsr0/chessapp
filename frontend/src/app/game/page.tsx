import type { Metadata } from "next";
import { Suspense } from "react";
import { GameView } from "@/components/game/GameView";
import { Skeleton } from "@/components/ui";

export const metadata: Metadata = { title: "Game review · ChessIQ" };

export default function GamePage() {
  return (
    <Suspense
      fallback={
        <div className="wrap pt-12 grid md:grid-cols-2 gap-8">
          <Skeleton className="aspect-square w-full" />
          <Skeleton className="h-96 w-full" />
        </div>
      }
    >
      <GameView />
    </Suspense>
  );
}
