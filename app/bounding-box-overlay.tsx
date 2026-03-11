"use client";

import type { Coordinates } from "./screenshot-button";

interface BoundingBoxOverlayProps {
  coords: Coordinates | null;
}

export default function BoundingBoxOverlay({ coords }: BoundingBoxOverlayProps) {
  if (!coords) return null;

  // Screenshot is captured at physical pixel resolution; CSS uses logical pixels.
  // Divide by devicePixelRatio to convert
  const left = coords.x - coords.width / 2;
  const top = coords.y - coords.height / 2 - 20; // -20 for nav bar
  const width = coords.width;
  const height = coords.height;

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
