"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

// Quadratic Bézier position: B(t) = (1-t)²P0 + 2(1-t)tP1 + t²P2
function bezierPoint(
  p0: { x: number; y: number },
  p1: { x: number; y: number },
  p2: { x: number; y: number },
  t: number,
) {
  const mt = 1 - t;
  return {
    x: mt * mt * p0.x + 2 * mt * t * p1.x + t * t * p2.x,
    y: mt * mt * p0.y + 2 * mt * t * p1.y + t * t * p2.y,
  };
}

// Tangent (derivative) of Bézier: B'(t) = 2(1-t)(P1-P0) + 2t(P2-P1)
function bezierTangent(
  p0: { x: number; y: number },
  p1: { x: number; y: number },
  p2: { x: number; y: number },
  t: number,
) {
  const mt = 1 - t;
  return {
    x: 2 * mt * (p1.x - p0.x) + 2 * t * (p2.x - p1.x),
    y: 2 * mt * (p1.y - p0.y) + 2 * t * (p2.y - p1.y),
  };
}

// Ease-in-out cubic
function easeInOut(t: number) {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

const FLIGHT_MS = 900;
const HOLD_MS = 3000;
const FADE_MS = 500;

export interface PointerOverlayProps {
  /** Target center in CSS viewport pixels. Null = hidden. */
  targetX: number | null;
  targetY: number | null;
  /** Speech bubble text shown on arrival. */
  label?: string;
  /** Starting x in CSS pixels (defaults near tutorial panel). */
  startX?: number;
  /** Starting y in CSS pixels (defaults near bottom). */
  startY?: number;
  onDone?: () => void;
}

type Phase = "idle" | "flying" | "arrived" | "fading";

export function PointerOverlay({
  targetX,
  targetY,
  label = "right here!",
  startX,
  startY,
  onDone,
}: PointerOverlayProps) {
  const [phase, setPhase] = useState<Phase>("idle");
  const [pos, setPos] = useState({ x: 0, y: 0 });
  const [angle, setAngle] = useState(0);
  const [scale, setScale] = useState(1);
  const [opacity, setOpacity] = useState(1);
  const [mounted, setMounted] = useState(false);
  const rafRef = useRef<number | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    // Cleanup any in-flight animation when target changes
    if (rafRef.current != null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    if (timerRef.current != null) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }

    if (targetX === null || targetY === null) {
      setPhase("idle");
      return;
    }

    const vw = typeof window !== "undefined" ? window.innerWidth : 800;
    const vh = typeof window !== "undefined" ? window.innerHeight : 600;

    const sx = startX ?? 70;
    const sy = startY ?? vh - 130;
    const tx = targetX;
    const ty = targetY;

    // Control point: perpendicular to midpoint, arcs "above" the straight path
    const midX = (sx + tx) / 2;
    const midY = (sy + ty) / 2;
    const dx = tx - sx;
    const dy = ty - sy;
    const dist = Math.hypot(dx, dy);
    const arcHeight = Math.min(dist * 0.32, 200);
    // Perpendicular direction (rotated 90° CCW)
    const perpX = dist > 0 ? -dy / dist : 0;
    const perpY = dist > 0 ? dx / dist : -1;

    const p0 = { x: sx, y: sy };
    const p1 = { x: midX + perpX * arcHeight, y: midY + perpY * arcHeight };
    const p2 = { x: tx, y: ty };

    setOpacity(1);
    setPhase("flying");

    const startTime = performance.now();

    function animateFlight(now: number) {
      const elapsed = now - startTime;
      const raw = Math.min(elapsed / FLIGHT_MS, 1);
      const t = easeInOut(raw);

      const p = bezierPoint(p0, p1, p2, t);
      const tang = bezierTangent(p0, p1, p2, Math.max(t, 0.001));
      const rot = Math.atan2(tang.y, tang.x) * (180 / Math.PI);
      // Scale peaks at midpoint of arc (swooping effect)
      const scl = 1 + 0.4 * Math.sin(Math.PI * raw);

      setPos(p);
      setAngle(rot);
      setScale(scl);

      if (raw < 1) {
        rafRef.current = requestAnimationFrame(animateFlight);
      } else {
        // Snap to exact target and show speech bubble
        setPos(p2);
        setAngle(Math.atan2(ty - sy, tx - sx) * (180 / Math.PI));
        setScale(1);
        setPhase("arrived");

        timerRef.current = setTimeout(() => {
          timerRef.current = null;
          const fadeStart = performance.now();

          function animateFade(now: number) {
            const elapsed = now - fadeStart;
            const t = Math.min(elapsed / FADE_MS, 1);
            setOpacity(1 - t);
            if (t < 1) {
              rafRef.current = requestAnimationFrame(animateFade);
            } else {
              setPhase("idle");
              onDone?.();
            }
          }
          rafRef.current = requestAnimationFrame(animateFade);
        }, HOLD_MS);
      }
    }

    rafRef.current = requestAnimationFrame(animateFlight);

    return () => {
      if (rafRef.current != null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
      if (timerRef.current != null) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [targetX, targetY]);

  if (!mounted || phase === "idle") return null;

  // Arrow: tip at (30,9), base on left. Placed so tip lands at pos.x, pos.y.
  const arrowLeft = pos.x - 30;
  const arrowTop = pos.y - 9;
  const glowSize = 6 + scale * 5;
  const arrived = phase === "arrived";

  // Speech bubble: appears to the right-above the tip. Flip left if near right edge.
  const vw = typeof window !== "undefined" ? window.innerWidth : 800;
  const bubbleRight = pos.x + 30 + 180 > vw;
  const bubbleLeft = bubbleRight ? pos.x - 30 - 180 : pos.x + 30;

  return createPortal(
    <div
      style={{
        position: "fixed",
        inset: 0,
        pointerEvents: "none",
        zIndex: 1000000,
        opacity,
      }}
      aria-hidden="true"
    >
      {/* Pulse halo under the tip (only after arrival) */}
      {arrived ? (
        <span
          style={{
            position: "absolute",
            left: pos.x - 18,
            top: pos.y - 18,
            width: 36,
            height: 36,
            borderRadius: "50%",
            background:
              "radial-gradient(circle, hsl(var(--accent) / 0.55) 0%, hsl(var(--primary) / 0.25) 55%, hsl(var(--accent) / 0) 75%)",
            animation: "tutorial-pointer-pulse 1.4s ease-out infinite",
          }}
        />
      ) : null}
      <style>{`
        @keyframes tutorial-pointer-pulse {
          0% { transform: scale(0.7); opacity: 0.9; }
          70% { transform: scale(1.6); opacity: 0; }
          100% { transform: scale(1.6); opacity: 0; }
        }
      `}</style>

      {/* Arrow cursor */}
      <svg
        width="34"
        height="20"
        viewBox="0 0 34 20"
        style={{
          position: "absolute",
          left: arrowLeft,
          top: arrowTop,
          transformOrigin: "30px 9px",
          transform: `rotate(${angle}deg) scale(${scale})`,
          overflow: "visible",
          filter: `drop-shadow(0 0 ${glowSize}px hsl(var(--accent) / 0.95)) drop-shadow(0 2px 4px rgba(0,0,0,0.45))`,
        }}
      >
        <defs>
          <linearGradient id="tutorial-arrow-fill" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="var(--green-1)" />
            <stop offset="55%" stopColor="var(--green-2)" />
            <stop offset="100%" stopColor="var(--green-3)" />
          </linearGradient>
        </defs>
        {/* Outer soft halo */}
        <polygon points="0,2 0,18 32,10" fill="hsl(var(--accent) / 0.28)" transform="scale(1.4) translate(-2.5,-1.8)" />
        {/* Main arrow with gradient */}
        <polygon
          points="0,1 0,19 30,10"
          fill="url(#tutorial-arrow-fill)"
          stroke="rgba(255,255,255,0.95)"
          strokeWidth="1.75"
          strokeLinejoin="round"
        />
      </svg>

      {/* Speech bubble — only shown when arrived */}
      {phase === "arrived" ? (
        <div
          style={{
            position: "absolute",
            left: bubbleLeft,
            top: pos.y - 38,
            background: "linear-gradient(135deg, rgba(18,14,6,0.95), rgba(10,10,18,0.95))",
            border: "1.5px solid hsl(var(--accent) / 0.85)",
            borderRadius: 10,
            padding: "7px 16px",
            color: "hsl(var(--accent))",
            fontSize: 14,
            fontWeight: 700,
            fontFamily: "system-ui, -apple-system, sans-serif",
            letterSpacing: "0.02em",
            whiteSpace: "nowrap",
            boxShadow: "0 4px 24px rgba(0,0,0,0.6), 0 0 16px hsl(var(--accent) / 0.28)",
          }}
        >
          {label}
          {/* Tail pointing toward arrow */}
          <div
            style={{
              position: "absolute",
              [bubbleRight ? "right" : "left"]: -8,
              top: "50%",
              transform: "translateY(-50%)",
              width: 0,
              height: 0,
              borderTop: "6px solid transparent",
              borderBottom: "6px solid transparent",
              [bubbleRight ? "borderLeft" : "borderRight"]: "8px solid hsl(var(--accent) / 0.75)",
            }}
          />
        </div>
      ) : null}
    </div>,
    document.body,
  );
}
