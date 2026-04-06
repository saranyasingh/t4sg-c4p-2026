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
  expandFactor = 2.2,
  onSpotlightRectChange,
}: BoundingBoxOverlayProps) {
  const maskId = useId().replace(/:/g, "");
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

      void window.electronAPI?.getPrimaryDisplayBounds?.().then((b) => {
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

  const minPadding = 36;
  const grownWidth = Math.max(rawWidth * expandFactor, rawWidth + minPadding * 2);
  const grownHeight = Math.max(rawHeight * expandFactor, rawHeight + minPadding * 2);
  /** Vision box center in CSS pixels — must drive the spotlight; do not re-derive from clamped left/top. */
  const centerX = rawLeft + rawWidth / 2;
  const centerY = rawTop + rawHeight / 2;

  const width = Math.min(grownWidth, vw - 8);
  const height = Math.min(grownHeight, vh - 8);
  const left = centerX - width / 2;
  const top = centerY - height / 2;

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

  const ellipseCx = centerX;
  const ellipseCy = centerY;
  const ellipseRx = width / 2;
  const ellipseRy = height / 2;

  /** Long feather so dim ramps gradually (circular mask r extends well past the ellipse). */
  const coreR = Math.max(ellipseRx, ellipseRy);
  const maskFeatherR = coreR + Math.min(160, coreR * 0.55 + 48);
  const vignetteR = Math.hypot(vw, vh) * 0.78;
  /** Inner vignette inside ellipse clip (rim slightly richer, center untouched). */
  const innerSpotR = Math.max(ellipseRx, ellipseRy);

  const vignetteGradId = `${maskId}-vignette`;
  const dimHoleMaskGradId = `${maskId}-dim-hole-grad`;
  const innerSpotGradId = `${maskId}-inner-spot-grad`;
  const spotClipId = `${maskId}-spot-clip`;

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
        {/* Luminance mask: black at center → no dimming; smooth feather → white at edges = full dimming. */}
        <radialGradient id={dimHoleMaskGradId} cx={ellipseCx} cy={ellipseCy} r={maskFeatherR} gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="rgb(0,0,0)" />
          <stop offset="40%" stopColor="rgb(0,0,0)" />
          <stop offset="62%" stopColor="rgb(55,55,55)" />
          <stop offset="78%" stopColor="rgb(165,165,165)" />
          <stop offset="92%" stopColor="rgb(238,238,238)" />
          <stop offset="100%" stopColor="rgb(255,255,255)" />
        </radialGradient>
        <mask id={maskId} maskUnits="userSpaceOnUse">
          <rect x="0" y="0" width={vw} height={vh} fill={`url(#${dimHoleMaskGradId})`} />
        </mask>
        <clipPath id={spotClipId} clipPathUnits="userSpaceOnUse">
          <ellipse cx={ellipseCx} cy={ellipseCy} rx={ellipseRx} ry={ellipseRy} />
        </clipPath>
        <radialGradient id={innerSpotGradId} cx={ellipseCx} cy={ellipseCy} r={innerSpotR} gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="rgb(0,0,0)" stopOpacity="0" />
          <stop offset="50%" stopColor="rgb(0,0,0)" stopOpacity="0" />
          <stop offset="85%" stopColor="rgb(0,4,12)" stopOpacity="0.12" />
          <stop offset="100%" stopColor="rgb(0,6,18)" stopOpacity="0.2" />
        </radialGradient>
        <radialGradient
          id={vignetteGradId}
          cx={ellipseCx}
          cy={ellipseCy}
          r={vignetteR}
          gradientUnits="userSpaceOnUse"
        >
          <stop offset="0%" stopColor="rgb(0,0,0)" stopOpacity="0" />
          <stop offset="18%" stopColor="rgb(0,0,0)" stopOpacity="0.08" />
          <stop offset="36%" stopColor="rgb(0,0,0)" stopOpacity="0.28" />
          <stop offset="52%" stopColor="rgb(0,0,0)" stopOpacity="0.48" />
          <stop offset="68%" stopColor="rgb(0,0,0)" stopOpacity="0.68" />
          <stop offset="84%" stopColor="rgb(0,0,0)" stopOpacity="0.88" />
          <stop offset="100%" stopColor="rgb(0,0,0)" stopOpacity="1" />
        </radialGradient>
      </defs>

      {/* Outside: graded dimming through feathered hole mask. */}
      <rect x={0} y={0} width={vw} height={vh} fill={`url(#${vignetteGradId})`} mask={`url(#${maskId})`} />
      <rect x={0} y={0} width={vw} height={vh} fill="rgba(0, 0, 0, 0.82)" mask={`url(#${maskId})`} />
      <rect x={0} y={0} width={vw} height={vh} fill="rgba(0, 3, 10, 0.32)" mask={`url(#${maskId})`} />
      {/* Inside ellipse: mild radial (center normal, rim slightly tinted). */}
      <rect x={0} y={0} width={vw} height={vh} fill={`url(#${innerSpotGradId})`} clipPath={`url(#${spotClipId})`} />
    </svg>,
    document.body,
  );
}
