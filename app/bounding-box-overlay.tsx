"use client";

import { useEffect, useId, useState } from "react";
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
  screenshotWidth: number; // actual width of analyzed screenshot
  screenshotHeight: number; // actual height of analyzed screenshot
  expandFactor?: number;
  onSpotlightRectChange?: (
    rect: {
      left: number;
      top: number;
      width: number;
      height: number;
      centerX: number;
      centerY: number;
    } | null,
  ) => void;
}

export default function BoundingBoxOverlay({
  coords,
  screenshotWidth,
  screenshotHeight,
  expandFactor = 3,
  onSpotlightRectChange,
}: BoundingBoxOverlayProps) {
  const spotlightGradientId = useId();
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

  const hasSpotlight = Boolean(mounted && coords);

  useEffect(() => {
    if (!hasSpotlight) {
      onSpotlightRectChange?.(null);
    }
  }, [hasSpotlight, onSpotlightRectChange]);

  const vw = viewportCss.w;
  const vh = viewportCss.h;
  const sw = screenshotWidth;
  const sh = screenshotHeight;

  // Map capture pixels to CSS pixels (stretch to fill the window — matches fullscreen desktop capture).
  const scaleX = vw / sw;
  const scaleY = vh / sh;

  const rawLeft = (coords?.x ?? 0) * scaleX;
  const rawTop = (coords?.y ?? 0) * scaleY;
  const rawWidth = (coords?.width ?? 0) * scaleX;
  const rawHeight = (coords?.height ?? 0) * scaleY;

  const minPadding = 52;
  const grownWidth = Math.max(rawWidth * expandFactor, rawWidth + minPadding * 2);
  const grownHeight = Math.max(rawHeight * expandFactor, rawHeight + minPadding * 2);
  const centerX = rawLeft + rawWidth / 2;
  const centerY = rawTop + rawHeight / 2;

  const width = Math.min(grownWidth, vw - 8);
  const height = Math.min(grownHeight, vh - 8);
  const left = Math.max(4, Math.min(centerX - width / 2, vw - width - 4));
  const top = Math.max(4, Math.min(centerY - height / 2, vh - height - 4));

  useEffect(() => {
    if (!hasSpotlight) return;
    onSpotlightRectChange?.({
      left,
      top,
      width,
      height,
      centerX,
      centerY,
    });
  }, [centerX, centerY, hasSpotlight, height, left, onSpotlightRectChange, top, width]);

  if (!hasSpotlight || !coords) {
    return null;
  }

  const ellipseCx = left + width / 2;
  const ellipseCy = top + height / 2;
  const ellipseRx = width / 2;
  const ellipseRy = height / 2;
  const rBase = Math.max(ellipseRx, ellipseRy, 1);
  const gradientTransform = `translate(${ellipseCx} ${ellipseCy}) scale(${ellipseRx / rBase} ${ellipseRy / rBase}) translate(${-ellipseCx} ${-ellipseCy})`;

  return createPortal(
    <svg
      width={vw}
      height={vh}
      viewBox={`0 0 ${vw} ${vh}`}
      style={{
        position: "fixed",
        inset: 0,
        pointerEvents: "none",
        zIndex: 999996,
      }}
      aria-hidden="true"
    >
      <defs>
        <radialGradient
          id={spotlightGradientId}
          gradientUnits="userSpaceOnUse"
          cx={ellipseCx}
          cy={ellipseCy}
          fx={ellipseCx}
          fy={ellipseCy}
          r={rBase}
          gradientTransform={gradientTransform}
        >
          <stop offset="0%" stopColor="rgb(18, 22, 32)" stopOpacity={0} />
          <stop offset="38%" stopColor="rgb(18, 22, 32)" stopOpacity={0.06} />
          <stop offset="72%" stopColor="rgb(18, 22, 32)" stopOpacity={0.22} />
          <stop offset="100%" stopColor="rgb(18, 22, 32)" stopOpacity={0.34} />
        </radialGradient>
      </defs>

      <rect x={0} y={0} width={vw} height={vh} fill={`url(#${spotlightGradientId})`} />
    </svg>,
    document.body,
  );
}
