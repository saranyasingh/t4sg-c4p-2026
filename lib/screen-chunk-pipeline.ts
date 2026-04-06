import {
  downscalePngBase64ForAnthropicVision,
  mapAnthropicVisionBoxToCaptureSpace,
} from "@/lib/electron-screen-capture";
import {
  isVisionDebugEnabled,
  pushVisionDebugLog,
  resetVisionDebug,
  setVisionDebug,
  type VisionDebugPhase,
} from "@/lib/vision-debug";
import { applyVisionGridToPngBase64 } from "@/lib/vision-grid-overlay";

export type FullCapture = { base64: string; width: number; height: number };

export type VisionBox = { x: number; y: number; width: number; height: number; confidence: number };

export type VisionResult =
  | { found: true; box: VisionBox }
  | { found: false; explanation: string };

/** Overlap along the seam between two halves (fraction of half-size on that axis). */
const HALF_OVERLAP_FRAC = 0.08;
const MAX_BINARY_DEPTH = 7;
const MIN_FOCUS_AREA_FRAC = 0.018;
const FULL_FRAME_SKIP_QUADS_CONF = 0.94;
/** Margin around full-frame bbox — keep large so we do not over-zoom on a shaky guess. */
const GUESS_PAD_FRAC = 0.58;
/** Smallest fraction of the screen the initial search ROI may cover (forces a wider first crop). */
const MIN_SEED_AREA_FRAC = 0.4;
/** Accept bbox on current crop without subdividing. */
const GREEDY_BBOX_CONF = 0.82;
/** After halving, accept the child if confidence stays near the parent-level bbox. */
const VERIFY_CHILD_VS_PARENT = 0.78;
const VERIFY_CHILD_ABS_MIN = 0.42;
const FINAL_BBOX_ATTEMPTS = 1;
/** Search crop is “zoomed in”: use stronger bbox model + budget (fraction of full screen area). */
const PRECISE_TILE_AREA_FRAC = 0.35;
/** Padded crop sent for clip-hint + optional single corrective bbox. */
const CLIP_HINT_PAD_FRAC = 0.32;
const CLIP_NUDGE_SHIFT_FRAC = 0.22;
type ClipDir = "none" | "left" | "right" | "top" | "bottom" | "out";
/** Which half of the parent ROI we kept when binary-zooming (h0 = left or top). */
type ZoomToward = "left" | "right" | "top" | "bottom";

function nudgeDirOppositeZoomToward(z: ZoomToward): ClipDir {
  switch (z) {
    case "left":
      return "right";
    case "right":
      return "left";
    case "top":
      return "bottom";
    case "bottom":
      return "top";
  }
}
/** After this many binary half-steps, subdivide focus into 4×4 and trim whole edge strips until conf drops. */
const GRID_TRIM_DIV = 4;
const GRID_TRIM_MAX_STEPS_PER_EDGE = 2;
const MIN_BINARY_HALVINGS_FOR_GRID = 5;
const GRID_TRIM_CONF_MARGIN = 0.032;
/** After a zoom, child conf must stay near parent crop bbox conf; else prefer the other half. */
const ZOOM_VS_PARENT_ABS_DROP = 0.12;
const ZOOM_VS_PARENT_REL_MIN = 0.88;
const ZOOM_PARENT_BASELINE_MIN = 0.2;
const MINIMAP_THUMB_LONG_EDGE = 280;

type TileRect = { ox: number; oy: number; tw: number; th: number };

type Hit = VisionBox & { tileIndex: number };

function clampRectToImage(r: TileRect, fullW: number, fullH: number): TileRect {
  const ox = Math.max(0, Math.min(Math.floor(r.ox), fullW - 1));
  const oy = Math.max(0, Math.min(Math.floor(r.oy), fullH - 1));
  const tw = Math.min(Math.max(1, Math.floor(r.tw)), fullW - ox);
  const th = Math.min(Math.max(1, Math.floor(r.th)), fullH - oy);
  return { ox, oy, tw, th };
}

function rectArea(r: TileRect): number {
  return r.tw * r.th;
}

function rectCenter(r: TileRect): { x: number; y: number } {
  return { x: r.ox + r.tw / 2, y: r.oy + r.th / 2 };
}

function expandVisionBox(box: VisionBox, fw: number, fh: number, marginFrac: number): TileRect {
  const mx = box.width * marginFrac;
  const my = box.height * marginFrac;
  return clampRectToImage(
    {
      ox: box.x - mx,
      oy: box.y - my,
      tw: box.width + 2 * mx,
      th: box.height + 2 * my,
    },
    fw,
    fh,
  );
}

/** Grow ROI around its center until it covers at least `minArea` pixels (caps at full screen). */
function growRectToMinArea(r: TileRect, fw: number, fh: number, minArea: number): TileRect {
  let out = clampRectToImage({ ...r }, fw, fh);
  let guard = 0;
  while (rectArea(out) < minArea && guard < 24) {
    guard += 1;
    const cx = out.ox + out.tw / 2;
    const cy = out.oy + out.th / 2;
    if (out.tw >= fw - 1 && out.th >= fh - 1) break;
    const nw = Math.min(fw, Math.max(out.tw + 1, Math.ceil(out.tw * 1.08)));
    const nh = Math.min(fh, Math.max(out.th + 1, Math.ceil(out.th * 1.08)));
    out = clampRectToImage(
      {
        ox: Math.floor(cx - nw / 2),
        oy: Math.floor(cy - nh / 2),
        tw: nw,
        th: nh,
      },
      fw,
      fh,
    );
  }
  return out;
}

type SplitAxis = "vertical" | "horizontal";

/** Two overlapping halves: [first, second] = left/right or top/bottom depending on axis. */
function splitIntoHalves(parent: TileRect, axis: SplitAxis, fullW: number, fullH: number): [TileRect, TileRect] | null {
  const { ox, oy, tw, th } = parent;
  if (axis === "vertical") {
    const mid = tw / 2;
    const seam = Math.max(2, mid * HALF_OVERLAP_FRAC);
    const left: TileRect = { ox, oy, tw: mid + seam, th };
    const right: TileRect = { ox: ox + mid - seam, oy, tw: mid + seam, th };
    const pair = [clampRectToImage(left, fullW, fullH), clampRectToImage(right, fullW, fullH)] as [TileRect, TileRect];
    if (pair[0].tw < 16 || pair[1].tw < 16 || pair[0].th < 12 || pair[1].th < 12) return null;
    return pair;
  }
  const mid = th / 2;
  const seam = Math.max(2, mid * HALF_OVERLAP_FRAC);
  const top: TileRect = { ox, oy, tw, th: mid + seam };
  const bottom: TileRect = { ox, oy: oy + mid - seam, tw, th: mid + seam };
  const pair = [clampRectToImage(top, fullW, fullH), clampRectToImage(bottom, fullW, fullH)] as [TileRect, TileRect];
  if (pair[0].th < 16 || pair[1].th < 16 || pair[0].tw < 12 || pair[1].tw < 12) return null;
  return pair;
}

function pointDist2ToRectCenter(px: number, py: number, r: TileRect): number {
  const c = rectCenter(r);
  return (px - c.x) ** 2 + (py - c.y) ** 2;
}

/** Prefer the half whose interior contains `pt`; tie / overlap → closer center. */
function pickPreferredHalf(
  a: TileRect,
  b: TileRect,
  pt: { x: number; y: number } | null,
): 0 | 1 {
  if (!pt) return 0;
  const inA = pt.x >= a.ox && pt.x < a.ox + a.tw && pt.y >= a.oy && pt.y < a.oy + a.th;
  const inB = pt.x >= b.ox && pt.x < b.ox + b.tw && pt.y >= b.oy && pt.y < b.oy + b.th;
  if (inA && !inB) return 0;
  if (inB && !inA) return 1;
  return pointDist2ToRectCenter(pt.x, pt.y, a) <= pointDist2ToRectCenter(pt.x, pt.y, b) ? 0 : 1;
}

/** `h0` is left (vertical) or top (horizontal) per `splitIntoHalves`. */
function zoomTowardFromChosenHalf(axis: SplitAxis, h0: TileRect, chosen: TileRect): ZoomToward {
  if (axis === "vertical") return chosen === h0 ? "left" : "right";
  return chosen === h0 ? "top" : "bottom";
}

async function loadScreenshotImage(full: FullCapture): Promise<HTMLImageElement> {
  const img = new Image();
  const url = `data:image/png;base64,${full.base64}`;
  await new Promise<void>((resolve, reject) => {
    img.onload = () => resolve();
    img.onerror = () => reject(new Error("Failed to decode full screenshot for tiling"));
    img.src = url;
  });
  return img;
}

async function cropImageToRegion(img: HTMLImageElement, tw: number, th: number, ox: number, oy: number): Promise<FullCapture> {
  const canvas = document.createElement("canvas");
  canvas.width = tw;
  canvas.height = th;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("No 2d context");
  ctx.drawImage(img, ox, oy, tw, th, 0, 0, tw, th);
  const base64 = canvas.toDataURL("image/png").split(",")[1]!;
  return { base64, width: tw, height: th };
}

/** Scales a crop of `img` to a small PNG for the vision debug panel. */
function buildFocusCropPreviewFromRect(img: HTMLImageElement, rect: TileRect): { base64: string; w: number; h: number } | null {
  const long = Math.max(rect.tw, rect.th);
  const scale = long > MINIMAP_THUMB_LONG_EDGE ? MINIMAP_THUMB_LONG_EDGE / long : 1;
  const w = Math.max(1, Math.round(rect.tw * scale));
  const h = Math.max(1, Math.round(rect.th * scale));
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  ctx.drawImage(img, rect.ox, rect.oy, rect.tw, rect.th, 0, 0, w, h);
  const base64 = canvas.toDataURL("image/png").split(",")[1] ?? "";
  if (!base64) return null;
  return { base64, w, h };
}

async function debugShowSearchRegion(
  img: HTMLImageElement,
  fullCap: FullCapture,
  rect: TileRect,
  detail: string,
  phase: VisionDebugPhase = "quad-zoom",
): Promise<void> {
  if (!isVisionDebugEnabled()) return;
  const preview = buildFocusCropPreviewFromRect(img, rect);
  setVisionDebug({
    phase,
    detail,
    fullCapture: { base64: fullCap.base64, w: fullCap.width, h: fullCap.height },
    activeTileRect: { ox: rect.ox, oy: rect.oy, tw: rect.tw, th: rect.th },
    focusCropPreview: preview,
  });
}

type TileDebugMeta = {
  phase: VisionDebugPhase;
  label: string;
  index: number;
  total: number;
};

function useTileTwoStage(): boolean {
  return process.env.NEXT_PUBLIC_VISION_TILE_TWO_STAGE !== "false";
}

function tileCoversSmallFractionOfScreen(rect: TileRect, fullArea: number): boolean {
  return fullArea > 0 && rectArea(rect) / fullArea < PRECISE_TILE_AREA_FRAC;
}

async function analyzeTileRect(
  api: NonNullable<Window["electronAPI"]>,
  fullCap: FullCapture,
  img: HTMLImageElement,
  rect: TileRect,
  targetDescription: string,
  tileIndex: number,
  debugMeta: TileDebugMeta | undefined,
  options?: { skipPresence?: boolean; precise?: boolean },
): Promise<Hit | null> {
  try {
    const crop = await cropImageToRegion(img, rect.tw, rect.th, rect.ox, rect.oy);
    const forApi = await downscalePngBase64ForAnthropicVision(crop);
    const fullArea = fullCap.width * fullCap.height;
    const usePrecise =
      options?.precise === true || (options?.precise !== false && tileCoversSmallFractionOfScreen(rect, fullArea));

    const presenceFn = api.analyzeScreenshotTilePresence;
    const twoStage = !options?.skipPresence && useTileTwoStage() && typeof presenceFn === "function";
    if (twoStage && presenceFn) {
      const pres = await presenceFn(
        forApi.base64,
        targetDescription,
        forApi.width,
        forApi.height,
      );
      if (isVisionDebugEnabled() && debugMeta) {
        pushVisionDebugLog(`${debugMeta.label} pres:${pres.success ? String(pres.present) : pres.error ?? "?"}`);
      }
      if (pres.success && pres.present === false) {
        return null;
      }
    }

    const gridded = await applyVisionGridToPngBase64(forApi, "tile");
    if (isVisionDebugEnabled() && debugMeta) {
      const focusCropPreview = buildFocusCropPreviewFromRect(img, rect);
      setVisionDebug({
        phase: debugMeta.phase,
        detail: `${debugMeta.label} → bbox${usePrecise ? " (precise)" : ""}`,
        lastApiImage: {
          base64: gridded.base64,
          w: gridded.width,
          h: gridded.height,
          kind: "tile",
        },
        fullCapture: { base64: fullCap.base64, w: fullCap.width, h: fullCap.height },
        activeTileRect: { ox: rect.ox, oy: rect.oy, tw: rect.tw, th: rect.th },
        focusCropPreview,
        tileLabel: debugMeta.label,
        tileIndex: debugMeta.index,
        tileTotal: debugMeta.total,
      });
    }

    const res = await api.analyzeScreenshotTile(
      gridded.base64,
      targetDescription,
      gridded.width,
      gridded.height,
      usePrecise ? { precise: true } : undefined,
    );

    if (!res.success || !res.found || !res.data) return null;

    const local = mapAnthropicVisionBoxToCaptureSpace(res.data, forApi.scaleToOriginalX, forApi.scaleToOriginalY);
    return {
      x: rect.ox + local.x,
      y: rect.oy + local.y,
      width: local.width,
      height: local.height,
      confidence: local.confidence,
      tileIndex,
    };
  } catch (e) {
    console.warn(`Tile ${tileIndex} vision failed`, e);
    return null;
  }
}

function hitToBox(h: Hit): VisionBox {
  return { x: h.x, y: h.y, width: h.width, height: h.height, confidence: h.confidence };
}

/** Bbox on a half after a zoom: must still look real vs the parent crop’s confidence. */
function childHalfLooksGood(hit: Hit | null, parentConf: number): boolean {
  if (!hit) return false;
  const c = hit.confidence;
  if (c < VERIFY_CHILD_ABS_MIN) return false;
  if (parentConf >= 0.12 && c < parentConf * VERIFY_CHILD_VS_PARENT) return false;
  return true;
}

/** Parent-level conf was plausible but zoom cratered (e.g. wrong half) — try the other side. */
function zoomConfidenceStable(child: Hit, parentConf: number): boolean {
  if (parentConf < ZOOM_PARENT_BASELINE_MIN) return true;
  if (child.confidence < parentConf - ZOOM_VS_PARENT_ABS_DROP) return false;
  if (parentConf >= 0.3 && child.confidence < parentConf * ZOOM_VS_PARENT_REL_MIN) return false;
  return true;
}

function normalizeClipDirection(s: string | undefined): ClipDir {
  const d = (s ?? "none")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_");
  if (d === "zoom_out" || d === "all" || d === "wider") return "out";
  if (d === "west") return "left";
  if (d === "east") return "right";
  if (d === "north") return "top";
  if (d === "south") return "bottom";
  if (d === "left" || d === "right" || d === "top" || d === "bottom" || d === "out") return d;
  return "none";
}

function nudgeSearchRectForClip(r: TileRect, dir: ClipDir, fw: number, fh: number): TileRect {
  if (dir === "none") return r;
  const f = CLIP_NUDGE_SHIFT_FRAC;
  let { ox, oy, tw, th } = r;
  const cx = ox + tw / 2;
  const cy = oy + th / 2;
  switch (dir) {
    case "left":
      ox -= tw * f;
      break;
    case "right":
      ox += tw * f;
      break;
    case "top":
      oy -= th * f;
      break;
    case "bottom":
      oy += th * f;
      break;
    case "out": {
      const ntw = Math.min(fw, Math.floor(tw * 1.4));
      const nth = Math.min(fh, Math.floor(th * 1.4));
      ox = Math.floor(cx - ntw / 2);
      oy = Math.floor(cy - nth / 2);
      tw = ntw;
      th = nth;
      break;
    }
    default:
      return r;
  }
  return clampRectToImage({ ox, oy, tw, th }, fw, fh);
}

/**
 * Cheap clip check; if clipped, one bbox on nudge (prefer opposite of last binary zoom when known).
 */
async function maybeAdjustBoxAfterClipHint(
  api: NonNullable<Window["electronAPI"]>,
  fullCap: FullCapture,
  img: HTMLImageElement,
  targetDescription: string,
  seed: VisionBox,
  zoomTowardHistory: readonly ZoomToward[] | undefined,
): Promise<VisionBox> {
  const clipFn = api.analyzeScreenshotTileClipHint;
  if (!api.analyzeScreenshotTile || typeof clipFn !== "function") return seed;

  const fw = fullCap.width;
  const fh = fullCap.height;
  const baseRoi = expandVisionBox(seed, fw, fh, CLIP_HINT_PAD_FRAC);

  const crop = await cropImageToRegion(img, baseRoi.tw, baseRoi.th, baseRoi.ox, baseRoi.oy);
  const forApi = await downscalePngBase64ForAnthropicVision(crop);
  const gridded = await applyVisionGridToPngBase64(forApi, "tile");

  const hint = await clipFn(gridded.base64, targetDescription, gridded.width, gridded.height);
  if (!hint.success) {
    if (isVisionDebugEnabled()) {
      pushVisionDebugLog(`clip-hint: ${hint.error ?? "failed"} → keep box`);
      setVisionDebug({ lastClipHint: null });
    }
    return seed;
  }

  const modelDir = normalizeClipDirection(hint.direction);
  const clipped = Boolean(hint.clipped);
  const lastZoom = zoomTowardHistory?.length ? zoomTowardHistory[zoomTowardHistory.length - 1]! : null;
  const zoomOpp: ClipDir | null = lastZoom ? nudgeDirOppositeZoomToward(lastZoom) : null;

  let nudgeDir: ClipDir;
  let usedZoomOpposite = false;
  if (!clipped) {
    nudgeDir = "none";
  } else if (modelDir === "out") {
    nudgeDir = "out";
  } else if (zoomOpp) {
    nudgeDir = zoomOpp;
    usedZoomOpposite = true;
  } else {
    nudgeDir = modelDir;
  }

  if (isVisionDebugEnabled()) {
    setVisionDebug({
      lastClipHint: {
        isClipped: clipped,
        modelDirection: String(hint.direction ?? ""),
        nudgeDirection: nudgeDir,
        usedZoomOpposite,
      },
    });
  }

  if (!clipped || nudgeDir === "none") {
    if (isVisionDebugEnabled()) {
      pushVisionDebugLog(`clip-hint: clipped=${clipped} modelDir=${modelDir} nudge=${nudgeDir} → keep box`);
    }
    return seed;
  }

  if (isVisionDebugEnabled()) {
    pushVisionDebugLog(
      `clip-hint: clipped → nudge ${nudgeDir} (model=${modelDir} lastZoomToward=${lastZoom ?? "—"} zoomOpposite=${usedZoomOpposite})`,
    );
  }

  const nudgedRoi = nudgeSearchRectForClip(baseRoi, nudgeDir, fw, fh);
  const hit = await analyzeTileRect(
    api,
    fullCap,
    img,
    nudgedRoi,
    targetDescription,
    9250,
    isVisionDebugEnabled()
      ? { phase: "quad-final", label: `clip-nudge-${nudgeDir}`, index: 0, total: 1 }
      : undefined,
    { skipPresence: true, precise: false },
  );

  if (hit && hit.confidence > seed.confidence) {
    if (isVisionDebugEnabled()) {
      pushVisionDebugLog(`clip-nudge: ${seed.confidence.toFixed(2)} → ${hit.confidence.toFixed(2)}`);
    }
    return hitToBox(hit);
  }
  if (isVisionDebugEnabled() && hit) {
    pushVisionDebugLog(
      `clip-nudge: conf ${hit.confidence.toFixed(2)} ≤ seed ${seed.confidence.toFixed(2)} → keep seed`,
    );
  }
  return seed;
}

async function finalizeFoundBox(
  api: NonNullable<Window["electronAPI"]>,
  fullCap: FullCapture,
  targetDescription: string,
  box: VisionBox,
  img: HTMLImageElement | null,
  zoomTowardHistory?: readonly ZoomToward[],
): Promise<VisionResult> {
  if (!api.analyzeScreenshotTile) {
    return { found: true, box };
  }
  const imageEl = img ?? (await loadScreenshotImage(fullCap));
  const chosen = await maybeAdjustBoxAfterClipHint(
    api,
    fullCap,
    imageEl,
    targetDescription,
    box,
    zoomTowardHistory,
  );
  return { found: true, box: chosen };
}

type GridIdx = { r0: number; r1: number; c0: number; c1: number };

function cellUnionRect(parent: TileRect, g: GridIdx, fw: number, fh: number): TileRect {
  const cellW = parent.tw / GRID_TRIM_DIV;
  const cellH = parent.th / GRID_TRIM_DIV;
  const ox = Math.floor(parent.ox + g.c0 * cellW);
  const oy = Math.floor(parent.oy + g.r0 * cellH);
  const tw = Math.max(8, Math.ceil((g.c1 - g.c0 + 1) * cellW));
  const th = Math.max(8, Math.ceil((g.r1 - g.r0 + 1) * cellH));
  return clampRectToImage({ ox, oy, tw, th }, fw, fh);
}

function shrinkGridOne(edge: "right" | "left" | "bottom" | "top", g: GridIdx): GridIdx | null {
  const { r0, r1, c0, c1 } = g;
  if (edge === "right") {
    if (c1 <= c0) return null;
    return { ...g, c1: c1 - 1 };
  }
  if (edge === "left") {
    if (c1 <= c0) return null;
    return { ...g, c0: c0 + 1 };
  }
  if (edge === "bottom") {
    if (r1 <= r0) return null;
    return { ...g, r1: r1 - 1 };
  }
  if (edge === "top") {
    if (r1 <= r0) return null;
    return { ...g, r0: r0 + 1 };
  }
  return null;
}

/**
 * Logical 4×4 over `parentFocus`; strip one row/column of cells from an edge, re-run bbox; stop when conf drops.
 */
async function gridEdgeTrimRefine(
  api: NonNullable<Window["electronAPI"]>,
  fullCap: FullCapture,
  img: HTMLImageElement,
  parentFocus: TileRect,
  targetDescription: string,
  fw: number,
  fh: number,
): Promise<Hit | null> {
  let g: GridIdx = { r0: 0, r1: GRID_TRIM_DIV - 1, c0: 0, c1: GRID_TRIM_DIV - 1 };
  const rect0 = cellUnionRect(parentFocus, g, fw, fh);
  let bestHit = await analyzeTileRect(
    api,
    fullCap,
    img,
    rect0,
    targetDescription,
    7000,
    isVisionDebugEnabled()
      ? { phase: "refine-tiles", label: "grid-4x4-baseline", index: 0, total: GRID_TRIM_DIV * 4 }
      : undefined,
    { skipPresence: true, precise: false },
  );
  if (!bestHit) return null;
  let bestConf = bestHit.confidence;
  pushVisionDebugLog(`grid-trim baseline ${GRID_TRIM_DIV}×${GRID_TRIM_DIV} conf=${bestConf.toFixed(2)}`);

  const edges: Array<"right" | "left" | "bottom" | "top"> = ["right", "left", "bottom", "top"];
  let callN = 1;
  for (const edge of edges) {
    for (let step = 0; step < GRID_TRIM_MAX_STEPS_PER_EDGE; step++) {
      const nextG = shrinkGridOne(edge, g);
      if (!nextG) break;
      const nextRect = cellUnionRect(parentFocus, nextG, fw, fh);
      const hit = await analyzeTileRect(
        api,
        fullCap,
        img,
        nextRect,
        targetDescription,
        7000 + callN,
        isVisionDebugEnabled()
          ? { phase: "refine-tiles", label: `grid-cut-${edge}`, index: callN, total: 24 }
          : undefined,
        { skipPresence: true, precise: false },
      );
      callN += 1;
      if (!hit) {
        pushVisionDebugLog(`grid-trim ${edge}: no hit — stop this edge`);
        break;
      }
      if (hit.confidence < bestConf - GRID_TRIM_CONF_MARGIN) {
        pushVisionDebugLog(
          `grid-trim ${edge}: conf ${hit.confidence.toFixed(2)} < ${bestConf.toFixed(2)} − margin — keep ${g.c1 - g.c0 + 1}×${g.r1 - g.r0 + 1}`,
        );
        break;
      }
      g = nextG;
      bestHit = hit;
      bestConf = hit.confidence;
      pushVisionDebugLog(
        `grid-trim ${edge}: → ${g.c1 - g.c0 + 1}×${g.r1 - g.r0 + 1} cells conf=${bestConf.toFixed(2)}`,
      );
    }
  }
  return bestHit;
}

/**
 * Full-frame guess (loosely padded ROI) → bbox on ROI; if still vague, alternate **vertical / horizontal**
 * half-splits (power-of-two halving). After each split we re-check the chosen half; if it fails vs the
 * parent step, we try the **other** half once, else stop refining with the current focus.
 */
export async function findTargetViaChunkedVision(
  fullCap: FullCapture,
  targetDescription: string,
): Promise<VisionResult> {
  const api = window.electronAPI;
  if (!api) return { found: false, explanation: "Screen analysis is not available outside of the desktop app." };

  const fw = fullCap.width;
  const fh = fullCap.height;
  const fullArea = fw * fh;

  if (isVisionDebugEnabled()) {
    resetVisionDebug();
    setVisionDebug({
      phase: "idle",
      detail: "Binary zoom (loose guess → half → half …)",
      fullCapture: { base64: fullCap.base64, w: fw, h: fh },
      lastApiImage: null,
      activeTileRect: null,
      focusCropPreview: null,
      tileLabel: "",
      tileIndex: 0,
      tileTotal: 0,
      lastClipHint: null,
      log: [],
    });
    pushVisionDebugLog("findTargetViaChunkedVision (greedy)");
  }

  if (!api.analyzeScreenshotTile) {
    const forFull = await downscalePngBase64ForAnthropicVision(fullCap);
    const gridded = await applyVisionGridToPngBase64(forFull, "full");
    if (isVisionDebugEnabled()) {
      setVisionDebug({
        phase: "simple-full",
        detail: "Single full-frame (no tile IPC)",
        lastApiImage: {
          base64: gridded.base64,
          w: gridded.width,
          h: gridded.height,
          kind: "full",
        },
        fullCapture: { base64: fullCap.base64, w: fw, h: fh },
        activeTileRect: null,
        focusCropPreview: null,
        tileLabel: "",
        tileIndex: 0,
        tileTotal: 0,
      });
    }
    const fullRes = await api.analyzeScreenshot(
      gridded.base64,
      targetDescription,
      gridded.width,
      gridded.height,
    );
    if (!fullRes.success) return { found: false, explanation: fullRes.error ?? "Screenshot analysis failed." };
    if (fullRes.found === false) return { found: false, explanation: fullRes.explanation ?? "The target could not be located on screen." };
    if (!fullRes.data) return { found: false, explanation: "The target could not be located on screen." };
    const box = mapAnthropicVisionBoxToCaptureSpace(fullRes.data, forFull.scaleToOriginalX, forFull.scaleToOriginalY);
    return { found: true, box };
  }

  const forFullFirst = await downscalePngBase64ForAnthropicVision(fullCap);
  const griddedFirst = await applyVisionGridToPngBase64(forFullFirst, "full");
  let cachedFullFrameNotFound = false;
  let cachedNotFoundExplanation: string | undefined;

  if (isVisionDebugEnabled()) {
    setVisionDebug({
      phase: "full-first",
      detail: "Full-frame guess (seeds zoom region)",
      lastApiImage: {
        base64: griddedFirst.base64,
        w: griddedFirst.width,
        h: griddedFirst.height,
        kind: "full",
      },
      fullCapture: { base64: fullCap.base64, w: fw, h: fh },
      activeTileRect: null,
      focusCropPreview: null,
      tileLabel: "",
      tileIndex: 0,
      tileTotal: 0,
    });
  }

  const fullFirst = await api.analyzeScreenshot(
    griddedFirst.base64,
    targetDescription,
    griddedFirst.width,
    griddedFirst.height,
  );
  cachedFullFrameNotFound = fullFirst.success && fullFirst.found === false;
  cachedNotFoundExplanation = cachedFullFrameNotFound ? fullFirst.explanation : undefined;

  if (fullFirst.success && fullFirst.found !== false && fullFirst.data) {
    const conf = fullFirst.data.confidence ?? 0;
    if (conf >= FULL_FRAME_SKIP_QUADS_CONF) {
      const box = mapAnthropicVisionBoxToCaptureSpace(
        fullFirst.data,
        forFullFirst.scaleToOriginalX,
        forFullFirst.scaleToOriginalY,
      );
      return finalizeFoundBox(api, fullCap, targetDescription, box, null);
    }
  }

  const img = await loadScreenshotImage(fullCap);

  let roughCenter: { x: number; y: number } | null = null;
  let focus = clampRectToImage({ ox: 0, oy: 0, tw: fw, th: fh }, fw, fh);
  const zoomTowardHistory: ZoomToward[] = [];
  let binaryFailedAtRoot = true;

  if (fullFirst.success && fullFirst.found !== false && fullFirst.data) {
    const seedBox = mapAnthropicVisionBoxToCaptureSpace(
      fullFirst.data,
      forFullFirst.scaleToOriginalX,
      forFullFirst.scaleToOriginalY,
    );
    roughCenter = { x: seedBox.x + seedBox.width / 2, y: seedBox.y + seedBox.height / 2 };
    focus = expandVisionBox(seedBox, fw, fh, GUESS_PAD_FRAC);
    focus = growRectToMinArea(focus, fw, fh, fullArea * MIN_SEED_AREA_FRAC);
    binaryFailedAtRoot = false;
    if (isVisionDebugEnabled()) {
      await debugShowSearchRegion(img, fullCap, focus, "Search region: loose pad + min area", "quad-zoom");
    }
    pushVisionDebugLog(`seed ROI ${focus.tw}×${focus.th} (~${((rectArea(focus) / fullArea) * 100).toFixed(0)}% screen)`);
  }

  let binaryHalvingsDone = 0;

  for (let depth = 0; depth < MAX_BINARY_DEPTH; depth++) {
    if (rectArea(focus) / fullArea <= MIN_FOCUS_AREA_FRAC) {
      break;
    }

    await debugShowSearchRegion(
      img,
      fullCap,
      focus,
      `Depth ${depth}: verify on focus (${focus.tw}×${focus.th})`,
      "quad-zoom",
    );

    const parentHit = await analyzeTileRect(
      api,
      fullCap,
      img,
      focus,
      targetDescription,
      depth,
      {
        phase: "quad-zoom",
        label: `parent-bbox-d${depth}`,
        index: depth,
        total: MAX_BINARY_DEPTH,
      },
      { skipPresence: true },
    );

    if (parentHit && parentHit.confidence >= GREEDY_BBOX_CONF) {
      return finalizeFoundBox(api, fullCap, targetDescription, hitToBox(parentHit), img, zoomTowardHistory);
    }

    const parentConf = parentHit?.confidence ?? 0;
    if (parentHit) {
      roughCenter = {
        x: parentHit.x + parentHit.width / 2,
        y: parentHit.y + parentHit.height / 2,
      };
    }

    const axis: SplitAxis = depth % 2 === 0 ? "vertical" : "horizontal";
    const halves = splitIntoHalves(focus, axis, fw, fh);
    if (!halves) break;

    const [h0, h1] = halves;
    const pref = pickPreferredHalf(h0, h1, roughCenter);
    const primary = pref === 0 ? h0 : h1;
    const sibling = pref === 0 ? h1 : h0;
    const axisLabel = axis === "vertical" ? "L|R" : "T|B";

    pushVisionDebugLog(`d=${depth} split ${axisLabel} pref=${pref === 0 ? "0" : "1"} parentConf=${parentConf.toFixed(2)}`);

    const [primaryHit, siblingHit] = await Promise.all([
      analyzeTileRect(
        api,
        fullCap,
        img,
        primary,
        targetDescription,
        depth * 10,
        {
          phase: "quad-zoom",
          label: `half-a-d${depth}`,
          index: depth,
          total: MAX_BINARY_DEPTH,
        },
        { skipPresence: true },
      ),
      analyzeTileRect(
        api,
        fullCap,
        img,
        sibling,
        targetDescription,
        depth * 10 + 1,
        {
          phase: "quad-zoom",
          label: `half-b-d${depth}`,
          index: depth,
          total: MAX_BINARY_DEPTH,
        },
        { skipPresence: true },
      ),
    ]);

    type HalfCand = { rect: TileRect; hit: Hit };
    const raw: HalfCand[] = [];
    if (primaryHit) raw.push({ rect: primary, hit: primaryHit });
    if (siblingHit) raw.push({ rect: sibling, hit: siblingHit });

    const stable = raw.filter(
      (c) => childHalfLooksGood(c.hit, parentConf) && zoomConfidenceStable(c.hit, parentConf),
    );
    const loose = raw.filter((c) => childHalfLooksGood(c.hit, parentConf));
    const pool = stable.length > 0 ? stable : loose;

    let nextFocus: TileRect | null = null;
    if (pool.length === 0) {
      pushVisionDebugLog(
        `d=${depth} both halves reject (conf ${primaryHit?.confidence.toFixed(2) ?? "—"} / ${siblingHit?.confidence.toFixed(2) ?? "—"} vs parent ${parentConf.toFixed(2)}) — stop binary refine`,
      );
      break;
    }

    pool.sort((a, b) => {
      const d = b.hit.confidence - a.hit.confidence;
      if (Math.abs(d) > 1e-6) return d > 0 ? 1 : -1;
      if (a.rect === primary && b.rect !== primary) return -1;
      if (a.rect !== primary && b.rect === primary) return 1;
      return 0;
    });
    const pick = pool[0]!;
    nextFocus = pick.rect;
    const pickedLabel = pick.rect === primary ? "primary" : "sibling";
    pushVisionDebugLog(
      `d=${depth} pick ${pickedLabel} conf=${pick.hit.confidence.toFixed(2)} pool=${stable.length > 0 ? "stable" : "loose-only"}`,
    );

    focus = clampRectToImage(nextFocus, fw, fh);
    const zToward = zoomTowardFromChosenHalf(axis, h0, pick.rect);
    zoomTowardHistory.push(zToward);
    binaryHalvingsDone += 1;
    binaryFailedAtRoot = false;
    pushVisionDebugLog(
      `d=${depth} zoom-toward=${zToward} (if clipped, nudge ${nudgeDirOppositeZoomToward(zToward)})`,
    );
    await debugShowSearchRegion(
      img,
      fullCap,
      focus,
      `Depth ${depth}: narrowed to half (${focus.tw}×${focus.th})`,
      "quad-zoom",
    );
  }

  if (binaryHalvingsDone >= MIN_BINARY_HALVINGS_FOR_GRID && focus.tw > 0 && focus.th > 0) {
    if (isVisionDebugEnabled()) {
      await debugShowSearchRegion(
        img,
        fullCap,
        focus,
        `4×4 edge trim (${binaryHalvingsDone} binary steps)`,
        "refine-tiles",
      );
    }
    pushVisionDebugLog(`grid edge-trim on focus ${focus.tw}×${focus.th}`);
    const gridHit = await gridEdgeTrimRefine(api, fullCap, img, focus, targetDescription, fw, fh);
    if (gridHit) {
      return finalizeFoundBox(api, fullCap, targetDescription, hitToBox(gridHit), img, zoomTowardHistory);
    }
    pushVisionDebugLog("grid edge-trim: baseline miss, fall through to final");
  }

  if (focus.tw > 0 && focus.th > 0) {
    await debugShowSearchRegion(img, fullCap, focus, "Final bbox region", "quad-final");

    let bestFinal: Hit | null = null;
    for (let attempt = 0; attempt < FINAL_BBOX_ATTEMPTS; attempt++) {
      const hit = await analyzeTileRect(
        api,
        fullCap,
        img,
        focus,
        targetDescription,
        attempt,
        {
          phase: "quad-final",
          label: `final-${attempt + 1}`,
          index: attempt,
          total: FINAL_BBOX_ATTEMPTS,
        },
        { skipPresence: true },
      );
      if (hit) {
        bestFinal = !bestFinal || hit.confidence > bestFinal.confidence ? hit : bestFinal;
        if (hit.confidence >= 0.55) {
          return finalizeFoundBox(api, fullCap, targetDescription, hitToBox(hit), img, zoomTowardHistory);
        }
      }
    }
    if (bestFinal) {
      return finalizeFoundBox(api, fullCap, targetDescription, hitToBox(bestFinal), img, zoomTowardHistory);
    }
  }

  if (cachedFullFrameNotFound && binaryFailedAtRoot) {
    return {
      found: false,
      explanation: cachedNotFoundExplanation ?? "The target could not be located on screen.",
    };
  }

  const forFull = await downscalePngBase64ForAnthropicVision(fullCap);
  const griddedFallback = await applyVisionGridToPngBase64(forFull, "full");
  if (isVisionDebugEnabled()) {
    setVisionDebug({
      phase: "full-fallback",
      detail: "Full-frame fallback",
      lastApiImage: {
        base64: griddedFallback.base64,
        w: griddedFallback.width,
        h: griddedFallback.height,
        kind: "full",
      },
      fullCapture: { base64: fullCap.base64, w: fw, h: fh },
      activeTileRect: null,
      focusCropPreview: null,
      tileLabel: "",
      tileIndex: 0,
      tileTotal: 0,
    });
  }
  const fullRes = await api.analyzeScreenshot(
    griddedFallback.base64,
    targetDescription,
    griddedFallback.width,
    griddedFallback.height,
  );
  if (!fullRes.success) return { found: false, explanation: fullRes.error ?? "Screenshot analysis failed." };
  if (fullRes.found === false) return { found: false, explanation: fullRes.explanation ?? "The target could not be located on screen." };
  if (!fullRes.data) return { found: false, explanation: "The target could not be located on screen." };

  const box = mapAnthropicVisionBoxToCaptureSpace(fullRes.data, forFull.scaleToOriginalX, forFull.scaleToOriginalY);
  return finalizeFoundBox(api, fullCap, targetDescription, box, img, zoomTowardHistory);
}
