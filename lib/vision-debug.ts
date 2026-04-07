export type VisionDebugPhase =
  | "idle"
  | "full-first"
  | "coarse-tiles"
  | "refine-tiles"
  | "fine-tiles"
  | "full-fallback"
  | "simple-full"
  | "quad-zoom"
  | "quad-final";

/** Result of the fast clip-hint pass after a final bbox (for debug UI). */
export type VisionClipHintDebug = {
  isClipped: boolean;
  modelDirection: string;
  nudgeDirection: string;
  usedZoomOpposite: boolean;
};

export type VisionDebugSnapshot = {
  phase: VisionDebugPhase;
  /** Human-readable line for the current step */
  detail: string;
  /** Last bitmap sent to Claude (with grid), for inspection */
  lastApiImage: { base64: string; w: number; h: number; kind: "full" | "tile" } | null;
  /** Original full capture for minimap (no grid) */
  fullCapture: { base64: string; w: number; h: number } | null;
  /** Current chunk in pixel space on full capture */
  activeTileRect: { ox: number; oy: number; tw: number; th: number } | null;
  /** Thumbnail of current search region (actual crop pixels) */
  focusCropPreview: { base64: string; w: number; h: number } | null;
  tileLabel: string;
  tileIndex: number;
  tileTotal: number;
  /** Set when clip-hint runs at end of locate; null before that */
  lastClipHint: VisionClipHintDebug | null;
  log: string[];
};

const MAX_LOG = 40;

let snapshot: VisionDebugSnapshot = {
  phase: "idle",
  detail: "",
  lastApiImage: null,
  fullCapture: null,
  activeTileRect: null,
  focusCropPreview: null,
  tileLabel: "",
  tileIndex: 0,
  tileTotal: 0,
  lastClipHint: null,
  log: [],
};

const listeners = new Set<() => void>();

export function isVisionDebugEnabled(): boolean {
  if (typeof window === "undefined") return false;
  return process.env.NEXT_PUBLIC_VISION_DEBUG === "true";
}

export function getVisionDebugSnapshot(): VisionDebugSnapshot {
  return snapshot;
}

export function resetVisionDebug(): void {
  snapshot = {
    phase: "idle",
    detail: "",
    lastApiImage: null,
    fullCapture: null,
    activeTileRect: null,
    focusCropPreview: null,
    tileLabel: "",
    tileIndex: 0,
    tileTotal: 0,
    lastClipHint: null,
    log: [],
  };
  listeners.forEach((l) => l());
}

export function pushVisionDebugLog(line: string): void {
  if (!isVisionDebugEnabled()) return;
  const next = [...snapshot.log, `${new Date().toISOString().slice(11, 23)} ${line}`];
  snapshot = { ...snapshot, log: next.slice(-MAX_LOG) };
  listeners.forEach((l) => l());
}

export function setVisionDebug(patch: Partial<VisionDebugSnapshot>): void {
  if (!isVisionDebugEnabled()) return;
  snapshot = { ...snapshot, ...patch };
  listeners.forEach((l) => l());
}

export function subscribeVisionDebug(cb: () => void): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}
