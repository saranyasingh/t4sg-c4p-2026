import {
  downscalePngBase64ForAnthropicVision,
  mapAnthropicVisionBoxToCaptureSpace,
} from "@/lib/electron-screen-capture";

export type FullCapture = { base64: string; width: number; height: number };

export type VisionBox = { x: number; y: number; width: number; height: number; confidence: number };

const DEFAULT_ROWS = 3;
const DEFAULT_COLS = 3;
/** Slight overlap so targets on tile edges are still large in at least one crop. */
const TILE_OVERLAP_FRAC = 0.12;
/** Avoid hammering the API; tiles in a batch run in parallel. */
const TILE_CONCURRENCY = 3;

type TileRect = { ox: number; oy: number; tw: number; th: number };

/** Build overlapping tile rectangles covering the full bitmap (int pixel bounds). */
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

async function cropPngBase64ToRegion(
  full: FullCapture,
  ox: number,
  oy: number,
  tw: number,
  th: number,
): Promise<FullCapture> {
  const img = new Image();
  const url = `data:image/png;base64,${full.base64}`;
  await new Promise<void>((resolve, reject) => {
    img.onload = () => resolve();
    img.onerror = () => reject(new Error("Failed to decode full screenshot for tiling"));
    img.src = url;
  });

  const canvas = document.createElement("canvas");
  canvas.width = tw;
  canvas.height = th;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("No 2d context");
  ctx.drawImage(img, ox, oy, tw, th, 0, 0, tw, th);
  const base64 = canvas.toDataURL("image/png").split(",")[1]!;
  return { base64, width: tw, height: th };
}

async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T, index: number) => Promise<R>): Promise<R[]> {
  const out: R[] = [];
  for (let i = 0; i < items.length; i += limit) {
    const slice = items.slice(i, i + limit);
    const part = await Promise.all(slice.map((item, j) => fn(item, i + j)));
    out.push(...part);
  }
  return out;
}

/**
 * Run tiled vision (each tile sees a larger-on-screen fraction of the target), then merge.
 * Falls back to a single full-frame analysis if no tile reports a hit.
 */
export async function findTargetViaChunkedVision(
  fullCap: FullCapture,
  targetDescription: string,
): Promise<VisionBox | null> {
  const api = window.electronAPI;
  if (!api) return null;

  const tiles = buildScreenTiles(fullCap.width, fullCap.height, DEFAULT_ROWS, DEFAULT_COLS);

  type Hit = VisionBox & { tileIndex: number };
  const hits: Hit[] = [];

  if (!api.analyzeScreenshotTile) {
    const forFull = await downscalePngBase64ForAnthropicVision(fullCap);
    const fullRes = await api.analyzeScreenshot(forFull.base64, targetDescription, forFull.width, forFull.height);
    if (!fullRes.success || !fullRes.data) return null;
    return mapAnthropicVisionBoxToCaptureSpace(fullRes.data, forFull.scaleToOriginalX, forFull.scaleToOriginalY);
  }

  await mapLimit(tiles, TILE_CONCURRENCY, async (rect, tileIndex) => {
    try {
      const crop = await cropPngBase64ToRegion(fullCap, rect.ox, rect.oy, rect.tw, rect.th);
      const forApi = await downscalePngBase64ForAnthropicVision(crop);
      const res = await api.analyzeScreenshotTile(
        forApi.base64,
        targetDescription,
        forApi.width,
        forApi.height,
      );

      if (!res.success || !res.found || !res.data) return;

      const local = mapAnthropicVisionBoxToCaptureSpace(res.data, forApi.scaleToOriginalX, forApi.scaleToOriginalY);
      hits.push({
        x: rect.ox + local.x,
        y: rect.oy + local.y,
        width: local.width,
        height: local.height,
        confidence: local.confidence,
        tileIndex,
      });
    } catch (e) {
      console.warn(`Tile ${tileIndex} vision failed`, e);
    }
  });

  if (hits.length > 0) {
    hits.sort((a, b) => b.confidence - a.confidence);
    const best = hits[0]!;
    return {
      x: best.x,
      y: best.y,
      width: best.width,
      height: best.height,
      confidence: best.confidence,
    };
  }

  const forFull = await downscalePngBase64ForAnthropicVision(fullCap);
  const fullRes = await api.analyzeScreenshot(forFull.base64, targetDescription, forFull.width, forFull.height);
  if (!fullRes.success || !fullRes.data) return null;

  return mapAnthropicVisionBoxToCaptureSpace(fullRes.data, forFull.scaleToOriginalX, forFull.scaleToOriginalY);
}
