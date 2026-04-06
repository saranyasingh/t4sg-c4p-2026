"use client";

import Image from "next/image";
import { useEffect, useState, useSyncExternalStore } from "react";
import {
  getVisionDebugSnapshot,
  isVisionDebugEnabled,
  resetVisionDebug,
  subscribeVisionDebug,
} from "@/lib/vision-debug";

const PANEL_W = 320;
const MINIMAP_H = 140;

/** Pixel overlay for a rectangle on the source image when the image is `object-fit: contain` in a fixed box. */
function tileOverlayPixels(
  tile: { ox: number; oy: number; tw: number; th: number },
  imgW: number,
  imgH: number,
  boxW: number,
  boxH: number,
): { left: number; top: number; width: number; height: number } {
  const scale = Math.min(boxW / imgW, boxH / imgH);
  const dispW = imgW * scale;
  const dispH = imgH * scale;
  const offX = (boxW - dispW) / 2;
  const offY = (boxH - dispH) / 2;
  return {
    left: offX + (tile.ox / imgW) * dispW,
    top: offY + (tile.oy / imgH) * dispH,
    width: (tile.tw / imgW) * dispW,
    height: (tile.th / imgH) * dispH,
  };
}

function containImageSize(imgW: number, imgH: number, boxW: number, boxH: number): { dispW: number; dispH: number; offX: number; offY: number } {
  const scale = Math.min(boxW / imgW, boxH / imgH);
  const dispW = imgW * scale;
  const dispH = imgH * scale;
  return {
    dispW,
    dispH,
    offX: (boxW - dispW) / 2,
    offY: (boxH - dispH) / 2,
  };
}

export function VisionDebugPanel() {
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
  }, []);

  const snap = useSyncExternalStore(subscribeVisionDebug, getVisionDebugSnapshot, getVisionDebugSnapshot);

  if (!mounted || !isVisionDebugEnabled()) {
    return null;
  }

  const last = snap.lastApiImage;
  const full = snap.fullCapture;
  const tile = snap.activeTileRect;

  return (
    <div
      className="fixed right-3 top-3 z-[999999] max-h-[85vh] overflow-auto rounded-lg border border-amber-500/50 bg-zinc-950/95 p-3 text-xs text-zinc-100 shadow-xl"
      style={{ width: PANEL_W + 24 }}
    >
      <div className="mb-2 flex items-center justify-between gap-2">
        <span className="font-semibold text-amber-200">Vision debug</span>
        <button
          type="button"
          className="rounded border border-zinc-600 px-2 py-0.5 text-[10px] hover:bg-zinc-800"
          onClick={() => resetVisionDebug()}
        >
          Clear
        </button>
      </div>
      <div className="mb-1 font-mono text-[10px] text-zinc-400">
        <div>
          phase: <span className="text-zinc-200">{snap.phase}</span>
        </div>
        <div className="truncate" title={snap.detail}>
          {snap.detail || "—"}
        </div>
        {snap.tileTotal > 0 ? (
          <div>
            chunk: {snap.tileLabel} {snap.tileIndex + 1}/{snap.tileTotal}
          </div>
        ) : null}
        {snap.lastClipHint ? (
          <div className="mt-1 space-y-0.5 border-t border-zinc-800 pt-1 text-[10px] text-zinc-300">
            <div>
              clip-hint isClipped:{" "}
              <span className={snap.lastClipHint.isClipped ? "text-amber-300" : "text-zinc-200"}>
                {String(snap.lastClipHint.isClipped)}
              </span>
            </div>
            <div className="truncate" title={snap.lastClipHint.modelDirection}>
              model dir: <span className="text-zinc-200">{snap.lastClipHint.modelDirection || "—"}</span>
            </div>
            <div>
              nudge: <span className="text-zinc-200">{snap.lastClipHint.nudgeDirection}</span>
              {snap.lastClipHint.usedZoomOpposite ? (
                <span className="ml-1 text-cyan-400">(zoom-opposite)</span>
              ) : null}
            </div>
          </div>
        ) : null}
      </div>

      {full ? (
        <div className="mb-2">
          <div className="mb-0.5 text-[10px] text-zinc-500">Full capture + active chunk</div>
          <div
            className="relative overflow-hidden rounded border border-zinc-700 bg-black"
            style={{ width: PANEL_W, height: MINIMAP_H }}
          >
            {(() => {
              const { dispW, dispH, offX, offY } = containImageSize(full.w, full.h, PANEL_W, MINIMAP_H);
              const src = `data:image/png;base64,${full.base64}`;
              const overlay =
                tile != null ? tileOverlayPixels(tile, full.w, full.h, PANEL_W, MINIMAP_H) : null;
              return (
                <>
                  <Image
                    unoptimized
                    alt="Vision debug: full capture minimap"
                    src={src}
                    width={Math.max(1, Math.round(dispW))}
                    height={Math.max(1, Math.round(dispH))}
                    className="absolute opacity-90"
                    style={{ left: offX, top: offY, maxWidth: "none" }}
                  />
                  {overlay ? (
                    <div
                      className="pointer-events-none absolute border-2 border-red-500/90 bg-red-500/10"
                      style={{
                        left: overlay.left,
                        top: overlay.top,
                        width: overlay.width,
                        height: overlay.height,
                      }}
                    />
                  ) : null}
                </>
              );
            })()}
          </div>
        </div>
      ) : null}

      {snap.focusCropPreview ? (
        <div className="mb-2">
          <div className="mb-0.5 text-[10px] text-zinc-500">
            Current search region ({snap.focusCropPreview.w}×{snap.focusCropPreview.h} preview)
          </div>
          <div className="relative h-40 w-full rounded border border-zinc-700 bg-black">
            <Image
              fill
              unoptimized
              alt="Vision debug: current search region crop"
              src={`data:image/png;base64,${snap.focusCropPreview.base64}`}
              className="object-contain"
              sizes={`${PANEL_W}px`}
            />
          </div>
        </div>
      ) : null}

      {last ? (
        <div className="mb-2">
          <div className="mb-0.5 text-[10px] text-zinc-500">
            Last image sent to API ({last.kind}, {last.w}×{last.h})
          </div>
          <div className="relative h-48 w-full rounded border border-zinc-700">
            <Image
              fill
              unoptimized
              alt="Vision debug: last image sent to API"
              src={`data:image/png;base64,${last.base64}`}
              className="object-contain"
              sizes={`${PANEL_W}px`}
            />
          </div>
        </div>
      ) : (
        <div className="mb-2 text-[10px] text-zinc-500">No API image yet.</div>
      )}

      {snap.log.length > 0 ? (
        <div>
          <div className="mb-0.5 text-[10px] text-zinc-500">Log</div>
          <pre className="max-h-32 overflow-auto whitespace-pre-wrap break-all rounded bg-zinc-900/80 p-1 font-mono text-[9px] text-zinc-400">
            {snap.log.slice(-12).join("\n")}
          </pre>
        </div>
      ) : null}
    </div>
  );
}
