"use client";

import type { Coordinates } from "@/app/lib/desktop-screenshot";

interface BoundingBoxOverlayProps {
  coords: Coordinates | null;
}

/**
 * Renders a highlight in fixed/CSS pixels. Coordinates from the main process are
 * normalized to logical display space to match the Electron window viewport.
 */
export default function BoundingBoxOverlay({ coords }: BoundingBoxOverlayProps) {
  if (!coords) return null;

  const left = coords.x - coords.width / 2;
  const top = coords.y - coords.height / 2;

  return (
    <div
      className="pointer-events-none fixed z-[9999] rounded-md border-2 border-primary bg-accent/15 shadow-[0_0_0_1px_hsl(var(--background)/0.92),0_8px_32px_hsl(var(--foreground)/0.18)] ring-2 ring-primary/40 backdrop-blur-[0.5px]"
      style={{
        left,
        top,
        width: coords.width,
        height: coords.height,
      }}
      aria-hidden
    />
  );
}
