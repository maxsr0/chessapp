"use client";

import { Chessboard } from "react-chessboard";
import type { Arrow } from "react-chessboard";

export type BoardProps = {
  id: string;
  fen: string;
  orientation?: "white" | "black";
  arrows?: Arrow[];
  highlights?: Record<string, string>; // square -> color
  draggable?: boolean;
  onMove?: (from: string, to: string) => boolean;
  showNotation?: boolean;
};

export function Board({ id, fen, orientation = "white", arrows = [], highlights = {}, draggable = false, onMove, showNotation = true }: BoardProps) {
  const squareStyles = Object.fromEntries(
    Object.entries(highlights).map(([sq, c]) => [sq, { boxShadow: `inset 0 0 0 3px ${c}` }]),
  );
  return (
    <div className="aspect-square w-full p-1.5 bg-hair rounded-[3px]">
    <Chessboard
      options={{
        id,
        position: fen,
        boardOrientation: orientation,
        arrows,
        squareStyles,
        allowDragging: draggable,
        allowDrawingArrows: false,
        showNotation,
        animationDurationInMs: 150,
        darkSquareStyle: { backgroundColor: "var(--sq-dark)" },
        lightSquareStyle: { backgroundColor: "var(--sq-light)" },
        boardStyle: { borderRadius: 2 },
        onPieceDrop: ({ sourceSquare, targetSquare }) =>
          targetSquare && onMove ? onMove(sourceSquare, targetSquare) : false,
      }}
    />
    </div>
  );
}
