/**
 * Draws a labeled coordinate grid on PNG bitmaps before vision API calls so the model
 * can reason about location; output remains normalized 0–1 in the same pixel space.
 *
 * Keep {@link VISION_GRID_FULL} / {@link VISION_GRID_TILE} in sync with vision prompts in main.cjs.
 */

export const VISION_GRID_FULL = { cols: 20, rows: 14 } as const;
export const VISION_GRID_TILE = { cols: 8, rows: 8 } as const;

function columnLetterFull(index: number): string {
  return String.fromCharCode("A".charCodeAt(0) + index);
}

function columnLetterTile(index: number): string {
  return String.fromCharCode("a".charCodeAt(0) + index);
}

function drawGridLine(ctx: CanvasRenderingContext2D, x1: number, y1: number, x2: number, y2: number): void {
  ctx.lineCap = "butt";
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.strokeStyle = "rgba(0, 0, 0, 0.72)";
  ctx.lineWidth = 2.5;
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.strokeStyle = "rgba(255, 255, 255, 0.94)";
  ctx.lineWidth = 1.35;
  ctx.stroke();
}

function drawLabelStrokeFill(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  align: CanvasTextAlign,
  outlinePx: number,
): void {
  ctx.textAlign = align;
  ctx.textBaseline = "middle";
  ctx.lineJoin = "round";
  ctx.miterLimit = 2;
  ctx.lineWidth = outlinePx;
  ctx.strokeStyle = "rgba(0, 0, 0, 0.88)";
  ctx.strokeText(text, x, y);
  ctx.fillStyle = "rgba(255, 255, 255, 0.98)";
  ctx.fillText(text, x, y);
}

function drawGridOverlay(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  kind: "full" | "tile",
): void {
  const { cols, rows } = kind === "full" ? VISION_GRID_FULL : VISION_GRID_TILE;
  ctx.save();

  const fontPx = Math.max(11, Math.min(w, h) / (kind === "full" ? 34 : 28));
  const outlinePx = Math.max(2.25, fontPx * 0.16);
  ctx.font = `600 ${fontPx}px ui-monospace, "Cascadia Code", monospace`;

  for (let c = 0; c <= cols; c++) {
    const x = (c / cols) * w;
    drawGridLine(ctx, x, 0, x, h);
  }
  for (let r = 0; r <= rows; r++) {
    const y = (r / rows) * h;
    drawGridLine(ctx, 0, y, w, y);
  }

  const cellW = w / cols;
  const cellH = h / rows;
  const colLabelY = Math.max(fontPx * 0.55, Math.min(18, cellH * 0.38));

  for (let c = 0; c < cols; c++) {
    const label = kind === "full" ? columnLetterFull(c) : columnLetterTile(c);
    drawLabelStrokeFill(ctx, label, (c + 0.5) * cellW, colLabelY, "center", outlinePx);
  }
  const rowLabelX = fontPx * 0.5;
  for (let r = 0; r < rows; r++) {
    const label = String(r + 1);
    drawLabelStrokeFill(ctx, label, rowLabelX, (r + 0.5) * cellH, "left", outlinePx);
  }

  ctx.restore();
}

/**
 * Paints the screenshot, then draws the grid on top (same dimensions as input).
 */
export async function applyVisionGridToPngBase64(
  cap: { base64: string; width: number; height: number },
  kind: "full" | "tile",
): Promise<{ base64: string; width: number; height: number }> {
  const img = new Image();
  const url = `data:image/png;base64,${cap.base64}`;
  await new Promise<void>((resolve, reject) => {
    img.onload = () => resolve();
    img.onerror = () => reject(new Error("Failed to decode image for vision grid"));
    img.src = url;
  });

  const canvas = document.createElement("canvas");
  canvas.width = cap.width;
  canvas.height = cap.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("No 2d context for vision grid");
  ctx.drawImage(img, 0, 0, cap.width, cap.height);
  drawGridOverlay(ctx, cap.width, cap.height, kind);

  const base64 = canvas.toDataURL("image/png").split(",")[1]!;
  return { base64, width: cap.width, height: cap.height };
}
