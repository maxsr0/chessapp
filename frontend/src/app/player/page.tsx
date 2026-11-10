import type { Metadata } from "next";
import { Suspense } from "react";
import { PlayerView } from "@/components/player/PlayerView";
import { Skeleton } from "@/components/ui";

export const metadata: Metadata = { title: "Player · ChessIQ" };

// The username comes from ?u=, which is only known in the browser (static export),
// so the view below renders client-side inside this Suspense boundary.
export default function PlayerPage() {
  return (
    <Suspense
      fallback={
        <div className="wrap pt-12 space-y-4">
          <Skeleton className="h-16 w-2/3" />
          <Skeleton className="h-40 w-full" />
        </div>
      }
    >
      <PlayerView />
    </Suspense>
  );
}
