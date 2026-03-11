"use client";

import type { Coordinates } from "./screenshot-button";

interface BoundingBoxOverlayProps {
  coords: Coordinates | null;
}

export default function BoundingBoxOverlay({ coords }: BoundingBoxOverlayProps) {
  if (!coords) return null;

  // Screenshot is captured at physical pixel resolution; CSS uses logical pixels.
  // Divide by devicePixelRatio to convert.
  const dpr = window.devicePixelRatio ?? 1;
  const left = (coords.x - coords.width / 2) / dpr;
  const top = (coords.y - coords.height / 2) / dpr;
  const width = coords.width / dpr;
  const height = coords.height / dpr;

  console.log(coords);

  return (
    <div
      style={{
        position: "fixed",
        left,
        top,
        width,
        height,
        background: "rgba(255, 50, 50, 0.4)",
        border: "4px solid red",
        borderRadius: 4,
        pointerEvents: "none",
        zIndex: 9999,
        boxShadow: "0 0 0 2px yellow",
      }}
    />
  );
}
