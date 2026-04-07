import {
  downscalePngBase64ForAnthropicVision,
  mapAnthropicVisionBoxToCaptureSpace,
} from "@/lib/electron-screen-capture";

export type FullCapture = { base64: string; width: number; height: number };

export type VisionBox = { x: number; y: number; width: number; height: number; confidence: number };

export type VisionResult =
  | { found: true; box: VisionBox }
  | { found: false; explanation: string };

/** Coarse grid before optional refinement or full-screen fine grid. */
const COARSE_ROWS = 4;
const COARSE_COLS = 4;
/** Local refinement grid inside one coarse tile. */
const REFINE_ROWS = 4;
const REFINE_COLS = 4;
/** Full-screen fine grid when coarse finds nothing. */
const FINE_ROWS = 4;
const FINE_COLS = 4;

/**
 * One downscaled full-frame pass: at or above this confidence we skip all tiling.
 */
const FULL_FRAME_SKIP_TILES_CONF = 0.95;

/**
 * After a batch of tile API calls completes, stop scheduling further batches if any hit
 * meets or exceeds this (saves calls when the model is already sure).
 */
const EARLY_EXIT_TILE_CONF = 0.95;

/**
 * Coarse-tile hit at or above this is returned as-is (no local 3×3 refinement inside that tile).
 */
const COARSE_GOOD_ENOUGH_CONF = 0.95;

/**
 * When the top-confidence hit looks like a thin partial crop (e.g. only a strip of browser chrome),
 * consider overlapping / neighboring tile hits and prefer a fuller box (see {@link pickBestHitCrossRef}).
 */
const CROSS_REF_IOU_MIN = 0.08;
/** If an alternate hit is within this confidence of the top sliver hit, prefer the non-sliver. */
const CROSS_REF_CONF_GAP = 0.22;
/** Non-sliver must be at least this much larger (area) to win with a weaker score. */
const CROSS_REF_AREA_RATIO = 2.4;
const CROSS_REF_WEAK_CONF_GAP = 0.4;

/** Slight overlap so targets on tile edges are still large in at least one crop. */
const TILE_OVERLAP_FRAC = 0.12;
/** Avoid hammering the API; tiles in a batch run in parallel. */
const TILE_CONCURRENCY = 3;

/** When the Anthropic API returns 429 / rate limit, wait then retry (IPC surfaces `error` from main). */
const RATE_LIMIT_RETRY_MS = 4000;
const RATE_LIMIT_MAX_RETRIES = 3;

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isLikelyRateLimitError(message: string | undefined): boolean {
  if (!message) return false;
  const m = message.toLowerCase();
  return (
    m.includes("429") ||
    m.includes("rate_limit") ||
    m.includes("rate limit") ||
    m.includes("too many requests")
  );
}

type ElectronApi = NonNullable<Window["electronAPI"]>;

async function analyzeScreenshotWithRateLimitRetry(
  api: ElectronApi,
  base64: string,
  targetDescription: string,
  width: number,
  height: number,
): Promise<Awaited<ReturnType<ElectronApi["analyzeScreenshot"]>>> {
  let res = await api.analyzeScreenshot(base64, targetDescription, width, height);
  for (let attempt = 0; attempt < RATE_LIMIT_MAX_RETRIES && !res.success && isLikelyRateLimitError(res.error); attempt++) {
    await delay(RATE_LIMIT_RETRY_MS);
    res = await api.analyzeScreenshot(base64, targetDescription, width, height);
  }
  return res;
}

async function analyzeScreenshotTileWithRateLimitRetry(
  api: ElectronApi,
  base64: string,
  targetDescription: string,
  width: number,
  height: number,
): Promise<Awaited<ReturnType<ElectronApi["analyzeScreenshotTile"]>>> {
  let res = await api.analyzeScreenshotTile(base64, targetDescription, width, height);
  for (let attempt = 0; attempt < RATE_LIMIT_MAX_RETRIES && !res.success && isLikelyRateLimitError(res.error); attempt++) {
    await delay(RATE_LIMIT_RETRY_MS);
    res = await api.analyzeScreenshotTile(base64, targetDescription, width, height);
  }
  return res;
}

type TileRect = { ox: number; oy: number; tw: number; th: number };

type Hit = VisionBox & { tileIndex: number };

/** Build overlapping tile rectangles covering the bitmap (int pixel bounds). */
function buildScreenTiles(fullW: number, fullH: number, rows: number, cols: number): TileRect[] {
  const rects: TileRect[] = [];
  const baseW = fullW / cols;
  const baseH = fullH / rows;
  const padW = baseW * TILE_OVERLAP_FRAC;
  const padH = baseH * TILE_OVERLAP_FRAC;

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      let ox = Math.floor(c * baseW - padW / 2);
      let oy = Math.floor(r * baseH - padH / 2);
      let tw = Math.ceil(baseW + padW);
      let th = Math.ceil(baseH + padH);
      ox = Math.max(0, Math.min(ox, fullW - 1));
      oy = Math.max(0, Math.min(oy, fullH - 1));
      tw = Math.min(tw, fullW - ox);
      th = Math.min(th, fullH - oy);
      if (tw > 8 && th > 8) rects.push({ ox, oy, tw, th });
    }
  }
  return rects;
}

/** Tile a rows×cols grid inside an axis-aligned region of the full screenshot. */
function buildScreenTilesInRegion(fullW: number, fullH: number, region: TileRect, rows: number, cols: number): TileRect[] {
  const inner = buildScreenTiles(region.tw, region.th, rows, cols);
  return inner
    .map((r) => {
      const ox = Math.max(0, Math.min(region.ox + r.ox, fullW - 1));
      const oy = Math.max(0, Math.min(region.oy + r.oy, fullH - 1));
      const tw = Math.min(r.tw, fullW - ox);
      const th = Math.min(r.th, fullH - oy);
      return { ox, oy, tw, th };
    })
    .filter((r) => r.tw > 8 && r.th > 8);
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

/**
 * Run fn over items in batches of `limit`. After each batch merges into `hits`, stop if `shouldStop(hits)`.
 * In-flight requests in the current batch always finish; later batches are skipped.
 */
async function mapLimitWithEarlyExit<T>(
  items: T[],
  limit: number,
  fn: (item: T, index: number) => Promise<Hit | null | undefined>,
  shouldStop: (hits: Hit[]) => boolean,
): Promise<Hit[]> {
  const hits: Hit[] = [];
  for (let i = 0; i < items.length; i += limit) {
    if (shouldStop(hits)) break;
    const slice = items.slice(i, i + limit);
    const part = await Promise.all(slice.map((item, j) => fn(item, i + j)));
    for (const p of part) {
      if (p) hits.push(p);
    }
    if (shouldStop(hits)) break;
  }
  return hits;
}

async function analyzeTileRect(
  api: NonNullable<Window["electronAPI"]>,
  fullCap: FullCapture,
  img: HTMLImageElement,
  rect: TileRect,
  targetDescription: string,
  tileIndex: number,
): Promise<Hit | null> {
  try {
    const crop = await cropImageToRegion(img, rect.tw, rect.th, rect.ox, rect.oy);
    const forApi = await downscalePngBase64ForAnthropicVision(crop);
    const res = await analyzeScreenshotTileWithRateLimitRetry(
      api,
      forApi.base64,
      targetDescription,
      forApi.width,
      forApi.height,
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

function boxIou(a: VisionBox, b: VisionBox): number {
  const x1 = Math.max(a.x, b.x);
  const y1 = Math.max(a.y, b.y);
  const x2 = Math.min(a.x + a.width, b.x + b.width);
  const y2 = Math.min(a.y + a.height, b.y + b.height);
  const iw = Math.max(0, x2 - x1);
  const ih = Math.max(0, y2 - y1);
  const inter = iw * ih;
  const u = a.width * a.height + b.width * b.height - inter;
  return u > 0 ? inter / u : 0;
}

function boxCenterDist(a: VisionBox, b: VisionBox): number {
  const ax = a.x + a.width / 2;
  const ay = a.y + a.height / 2;
  const bx = b.x + b.width / 2;
  const by = b.y + b.height / 2;
  return Math.hypot(ax - bx, ay - by);
}

function tilesAre8Neighbors(a: number, b: number, cols: number): boolean {
  if (a === b) return false;
  const ar = Math.floor(a / cols);
  const ac = a % cols;
  const br = Math.floor(b / cols);
  const bc = b % cols;
  return Math.abs(ar - br) <= 1 && Math.abs(ac - bc) <= 1;
}

/**
 * True when the model box is likely a partial “sliver” of the target in this tile (thin strip or tiny blob),
 * so we should cross-check other chunks before trusting it alone.
 */
function isSliverHit(hit: Hit, rect: TileRect | undefined): boolean {
  const w = hit.width;
  const h = hit.height;
  if (w <= 0 || h <= 0) return true;
  const aspect = Math.min(w, h) / Math.max(w, h);
  // Typical when only the edge of a toolbar / window chrome is inside the crop.
  if (aspect < 0.14) return true;
  if (!rect) return aspect < 0.22 && w * h < 900;
  const tileArea = rect.tw * rect.th;
  const frac = (w * h) / tileArea;
  if (frac < 0.028 && aspect < 0.38) return true;
  return false;
}

function makeEarlyExitShouldStop(rects: TileRect[]): (hits: Hit[]) => boolean {
  return (hits: Hit[]) =>
    hits.some((h) => {
      if (h.confidence < EARLY_EXIT_TILE_CONF) return false;
      const r = rects[h.tileIndex];
      return !isSliverHit(h, r);
    });
}

/**
 * Prefer the highest-confidence hit unless it is a sliver; then, among IoU / 8-neighbor / nearby hits,
 * prefer a non-sliver with similar confidence, or a much larger overlapping box.
 */
function pickBestHitCrossRef(hits: Hit[], rects: TileRect[], gridCols: number): Hit | null {
  if (hits.length === 0) return null;
  const byConf = [...hits].sort((a, b) => b.confidence - a.confidence);
  const top = byConf[0]!;
  const topRect = rects[top.tileIndex];

  if (!isSliverHit(top, topRect)) return top;

  const span = Math.max(top.width, top.height, 1);
  const related = hits.filter((h) => {
    if (h === top) return false;
    if (boxIou(h, top) >= CROSS_REF_IOU_MIN) return true;
    if (tilesAre8Neighbors(h.tileIndex, top.tileIndex, gridCols)) return true;
    return boxCenterDist(h, top) < span * 2.6;
  });

  const nonSliver = related
    .filter((h) => !isSliverHit(h, rects[h.tileIndex]))
    .sort((a, b) => b.confidence - a.confidence);

  if (nonSliver.length > 0) {
    const bestAlt = nonSliver[0]!;
    if (bestAlt.confidence >= top.confidence - CROSS_REF_CONF_GAP) return bestAlt;
    const topArea = Math.max(1, top.width * top.height);
    const altArea = bestAlt.width * bestAlt.height;
    if (altArea >= topArea * CROSS_REF_AREA_RATIO && bestAlt.confidence >= top.confidence - CROSS_REF_WEAK_CONF_GAP) {
      return bestAlt;
    }
  }

  const pool = related.length > 0 ? [top, ...related] : [top];
  return pool.reduce((a, b) => (a.width * a.height >= b.width * b.height ? a : b));
}

function hitToBox(h: Hit): VisionBox {
  return { x: h.x, y: h.y, width: h.width, height: h.height, confidence: h.confidence };
}

/**
 * Hierarchical vision: optional confident full-frame pass → coarse grid → optional refinement in the best
 * coarse tile, or full-screen fine grid if coarse finds nothing. Batches can early-exit on high confidence
 * unless the only strong hit is a sliver (then more tiles run for cross-reference). Overlapping hits are
 * resolved with {@link pickBestHitCrossRef}. Falls back to full-frame analysis for “not found” explanations.
 */
export async function findTargetViaChunkedVision(
  fullCap: FullCapture,
  targetDescription: string,
): Promise<VisionResult> {
  const api = window.electronAPI;
  if (!api) return { found: false, explanation: "Screen analysis is not available outside of the desktop app." };

  if (!api.analyzeScreenshotTile) {
    const forFull = await downscalePngBase64ForAnthropicVision(fullCap);
    const fullRes = await analyzeScreenshotWithRateLimitRetry(
      api,
      forFull.base64,
      targetDescription,
      forFull.width,
      forFull.height,
    );
    if (!fullRes.success) return { found: false, explanation: fullRes.error ?? "Screenshot analysis failed." };
    if (fullRes.found === false) return { found: false, explanation: fullRes.explanation ?? "The target could not be located on screen." };
    if (!fullRes.data) return { found: false, explanation: "The target could not be located on screen." };
    const box = mapAnthropicVisionBoxToCaptureSpace(fullRes.data, forFull.scaleToOriginalX, forFull.scaleToOriginalY);
    return { found: true, box };
  }

  const forFullFirst = await downscalePngBase64ForAnthropicVision(fullCap);
  const fullFirst = await analyzeScreenshotWithRateLimitRetry(
    api,
    forFullFirst.base64,
    targetDescription,
    forFullFirst.width,
    forFullFirst.height,
  );
  /** If the first full-frame pass already said "not found", reuse it after tile passes fail (avoids a second identical API call). */
  const cachedFullFrameNotFound = fullFirst.success && fullFirst.found === false;
  const cachedNotFoundExplanation = cachedFullFrameNotFound ? fullFirst.explanation : undefined;

  if (fullFirst.success && fullFirst.found !== false && fullFirst.data) {
    const conf = fullFirst.data.confidence ?? 0;
    if (conf >= FULL_FRAME_SKIP_TILES_CONF) {
      const box = mapAnthropicVisionBoxToCaptureSpace(
        fullFirst.data,
        forFullFirst.scaleToOriginalX,
        forFullFirst.scaleToOriginalY,
      );
      return { found: true, box };
    }
  }

  const img = await loadScreenshotImage(fullCap);
  const { width: fw, height: fh } = fullCap;

  const coarseRects = buildScreenTiles(fw, fh, COARSE_ROWS, COARSE_COLS);
  const coarseHits = await mapLimitWithEarlyExit(
    coarseRects,
    TILE_CONCURRENCY,
    (rect, tileIndex) => analyzeTileRect(api, fullCap, img, rect, targetDescription, tileIndex),
    makeEarlyExitShouldStop(coarseRects),
  );

  if (coarseHits.length > 0) {
    const bestCoarse = pickBestHitCrossRef(coarseHits, coarseRects, COARSE_COLS)!;
    if (bestCoarse.confidence >= COARSE_GOOD_ENOUGH_CONF) {
      return { found: true, box: hitToBox(bestCoarse) };
    }

    const coarseRect = coarseRects[bestCoarse.tileIndex];
    if (coarseRect) {
      const refineRects = buildScreenTilesInRegion(fw, fh, coarseRect, REFINE_ROWS, REFINE_COLS);
      const refineHits = await mapLimitWithEarlyExit(
        refineRects,
        TILE_CONCURRENCY,
        (rect, tileIndex) => analyzeTileRect(api, fullCap, img, rect, targetDescription, tileIndex),
        makeEarlyExitShouldStop(refineRects),
      );
      if (refineHits.length > 0) {
        const resolved = pickBestHitCrossRef(refineHits, refineRects, REFINE_COLS)!;
        return { found: true, box: hitToBox(resolved) };
      }
    }

    return { found: true, box: hitToBox(bestCoarse) };
  }

  const fineRects = buildScreenTiles(fw, fh, FINE_ROWS, FINE_COLS);
  const fineHits = await mapLimitWithEarlyExit(
    fineRects,
    TILE_CONCURRENCY,
    (rect, tileIndex) => analyzeTileRect(api, fullCap, img, rect, targetDescription, tileIndex),
    makeEarlyExitShouldStop(fineRects),
  );

  if (fineHits.length > 0) {
    const resolved = pickBestHitCrossRef(fineHits, fineRects, FINE_COLS)!;
    return { found: true, box: hitToBox(resolved) };
  }

  if (cachedFullFrameNotFound) {
    return {
      found: false,
      explanation: cachedNotFoundExplanation ?? "The target could not be located on screen.",
    };
  }

  const forFull = await downscalePngBase64ForAnthropicVision(fullCap);
  const fullRes = await analyzeScreenshotWithRateLimitRetry(
    api,
    forFull.base64,
    targetDescription,
    forFull.width,
    forFull.height,
  );
  if (!fullRes.success) return { found: false, explanation: fullRes.error ?? "Screenshot analysis failed." };
  if (fullRes.found === false) return { found: false, explanation: fullRes.explanation ?? "The target could not be located on screen." };
  if (!fullRes.data) return { found: false, explanation: "The target could not be located on screen." };

  const box = mapAnthropicVisionBoxToCaptureSpace(fullRes.data, forFull.scaleToOriginalX, forFull.scaleToOriginalY);
  return { found: true, box };
}
