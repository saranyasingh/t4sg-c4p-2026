"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

export interface Coordinates {
  /** Top-left x of the box in screenshot pixel space (origin top-left of image). */
  x: number;
  y: number;
  width: number;
  height: number;
  confidence?: number;
}

interface BoundingBoxOverlayProps {
  coords: Coordinates | null;
  screenshotWidth: number;   // actual width of analyzed screenshot
  screenshotHeight: number;  // actual height of analyzed screenshot
}

export default function BoundingBoxOverlay({
  coords,
  screenshotWidth,
  screenshotHeight,
}: BoundingBoxOverlayProps) {
  const [mounted, setMounted] = useState(false);
  const [viewportCss, setViewportCss] = useState(() => ({
    w: typeof window !== "undefined" ? window.innerWidth : 1,
    h: typeof window !== "undefined" ? window.innerHeight : 1,
  }));

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    function syncViewport() {
      const iw = window.innerWidth;
      const ih = window.innerHeight;

      const apply = (bw: number, bh: number) => {
        if (bw <= 0 || bh <= 0) return;
        // inner* can be a few px smaller than the real fullscreen client area (scrollbar, rounding),
        // which underscales and pulls highlights up/left — especially visible on small boxes.
        setViewportCss({
          w: Math.max(iw, bw),
          h: Math.max(ih, bh),
        });
      };

      apply(iw, ih);

      window.electronAPI?.getPrimaryDisplayBounds?.().then((b) => {
        if (b) apply(b.width, b.height);
      });
    }

    syncViewport();
    window.addEventListener("resize", syncViewport);
    return () => window.removeEventListener("resize", syncViewport);
  }, []);

  if (!mounted || !coords) return null;

  const vw = viewportCss.w;
  const vh = viewportCss.h;
  const sw = screenshotWidth;
  const sh = screenshotHeight;

  // Map capture pixels to CSS pixels (stretch to fill the window — matches fullscreen desktop capture).
  const scaleX = vw / sw;
  const scaleY = vh / sh;

  const left = coords.x * scaleX;
  const top = coords.y * scaleY;
  const width = coords.width * scaleX;
  const height = coords.height * scaleY;

  return createPortal(
    <div
      style={{
        position: "fixed",
        left,
        top,
        width,
        height,
        boxSizing: "border-box",
        background: "rgba(255, 50, 50, 0.25)",
        border: "3px solid red",
        borderRadius: 8,
        pointerEvents: "none",
        zIndex: 999999,
        boxShadow: "0 0 0 2px yellow",
      }}
    />,
    document.body,
  );
}