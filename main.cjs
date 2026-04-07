const { app, BrowserWindow, desktopCapturer, dialog, ipcMain, globalShortcut, screen } = require("electron");

// Assistant TTS runs after async chat responses; without this, Chromium often blocks HTMLAudioElement.play().
app.commandLine.appendSwitch("autoplay-policy", "no-user-gesture-required");
const fs = require("fs");
const path = require("path");

/** Load repo-root .env then app .env (same order as Next.js load-root-env.mjs). */
function loadEnvFromFileSync(absolutePath) {
  try {
    if (!fs.existsSync(absolutePath)) return;
    const raw = fs.readFileSync(absolutePath, "utf8");
    for (const line of raw.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const rest = trimmed.startsWith("export ") ? trimmed.slice(7).trim() : trimmed;
      const eq = rest.indexOf("=");
      if (eq === -1) continue;
      const key = rest.slice(0, eq).trim();
      if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) continue;
      let value = rest.slice(eq + 1).trim();
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      process.env[key] = value;
    }
  } catch {
    /* ignore */
  }
}
loadEnvFromFileSync(path.join(__dirname, "..", ".env"));
loadEnvFromFileSync(path.join(__dirname, ".env"));

let win = null;
let screenshotPermissionGranted = false;

function setClickThrough(enabled, options) {
  if (!win) return;
  win.setIgnoreMouseEvents(enabled, options);
}

function visionToNum(v) {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim() !== "") {
    const n = Number(v);
    if (Number.isFinite(n)) return n;
  }
  return NaN;
}

function normalizedBoxToPixels(parsed, w, h) {
  const leftN = visionToNum(parsed.left);
  const topN = visionToNum(parsed.top);
  const widthN = visionToNum(parsed.width);
  const heightN = visionToNum(parsed.height);
  if (![leftN, topN, widthN, heightN].every((n) => Number.isFinite(n))) return null;
  const clamp01 = (n) => Math.max(0, Math.min(1, n));
  const confRaw = visionToNum(parsed.confidence);
  return {
    x: clamp01(leftN) * w,
    y: clamp01(topN) * h,
    width: clamp01(widthN) * w,
    height: clamp01(heightN) * h,
    confidence: Number.isFinite(confRaw) ? clamp01(confRaw) : 0,
  };
}

function extractAssistantText(response) {
  const textBlock = response.content.find((b) => b.type === "text");
  return textBlock?.text ?? "";
}

/** Pull first `{ ... }` from text, respecting JSON string escaping (handles prose before/after the object). */
function extractFirstJsonObject(s) {
  const start = s.indexOf("{");
  if (start === -1) return null;
  let depth = 0;
  let inString = false;
  let escape = false;
  for (let i = start; i < s.length; i++) {
    const c = s[i];
    if (escape) {
      escape = false;
      continue;
    }
    if (inString) {
      if (c === "\\") {
        escape = true;
        continue;
      }
      if (c === '"') inString = false;
      continue;
    }
    if (c === '"') {
      inString = true;
      continue;
    }
    if (c === "{") depth++;
    else if (c === "}") {
      depth--;
      if (depth === 0) return s.slice(start, i + 1);
    }
  }
  return null;
}

/**
 * Parse a JSON object from vision assistant text (may include markdown fences or a short preamble).
 */
function parseAssistantJson(raw) {
  const cleaned = raw.replace(/```json|```/g, "").trim();
  try {
    return JSON.parse(cleaned);
  } catch {
    const extracted = extractFirstJsonObject(cleaned);
    if (extracted) {
      try {
        return JSON.parse(extracted);
      } catch {
        /* fall through */
      }
    }
    const preview = cleaned.length > 200 ? `${cleaned.slice(0, 200)}…` : cleaned;
    throw new SyntaxError(`Assistant reply is not valid JSON: ${preview}`);
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isRetriableAnthropicError(err) {
  const status = err?.status;
  if (status === 429 || status === 503 || status === 529) return true;
  const inner = err?.error?.error ?? err?.error ?? {};
  const t = inner.type ?? "";
  if (t === "rate_limit_error" || t === "overloaded_error") return true;
  const msg = String(err?.message ?? "");
  if (/rate|429|529|overloaded|too many requests|retry/i.test(msg)) return true;
  return false;
}

/**
 * Retries Messages API calls on rate limits / overload (exponential backoff + jitter).
 */
async function anthropicCreateWithRetry(client, body, { maxRetries = 8 } = {}) {
  let lastErr;
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await client.messages.create(body);
    } catch (err) {
      lastErr = err;
      if (!isRetriableAnthropicError(err) || attempt === maxRetries - 1) throw err;
      let waitMs = Math.min(20000, 700 * 2 ** attempt);
      const h = err?.headers;
      const ra = h?.get?.("retry-after") ?? h?.["retry-after"];
      if (ra != null && !Number.isNaN(Number(ra))) waitMs = Math.max(waitMs, Number(ra) * 1000);
      await sleep(waitMs + Math.random() * 500);
    }
  }
  throw lastErr;
}

/** Default vision model (Haiku 4.5 — fast/cheap). Override with ANTHROPIC_MODEL. */
const DEFAULT_VISION_MODEL = "claude-haiku-4-5";
/** When tile IPC requests precise=true (small on-screen crop); override with ANTHROPIC_MODEL_TILE_PRECISE. */
const DEFAULT_TILE_PRECISE_MODEL = "claude-sonnet-4-20250514";

async function analyzeScreenshot(imageBase64, targetDescription, imageWidth, imageHeight) {
  const { default: Anthropic } = await import("@anthropic-ai/sdk");
  require("dotenv/config");

  if (!process.env.ANTHROPIC_API_KEY) {
    return { found: false, explanation: "The assistant is not set up yet. Please ask your administrator to configure the API key and restart the app." };
  }

  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  const display = screen.getPrimaryDisplay();
  const { width: logicalW, height: logicalH } = display.size;
  const w =
    typeof imageWidth === "number" && Number.isFinite(imageWidth) && imageWidth > 0
      ? Math.round(imageWidth)
      : logicalW;
  const h =
    typeof imageHeight === "number" && Number.isFinite(imageHeight) && imageHeight > 0
      ? Math.round(imageHeight)
      : logicalH;

  const target =
    typeof targetDescription === "string" && targetDescription.trim().length > 0
      ? targetDescription.trim()
      : "the Google Chrome app icon on the desktop, taskbar, or Dock";

  const model = process.env.ANTHROPIC_MODEL || DEFAULT_VISION_MODEL;
  const response = await anthropicCreateWithRetry(client, {
    model,
    max_tokens: 1024,
    messages: [
      {
        role: "user",
        content: [
          {
            type: "image",
            source: {
              type: "base64",
              media_type: "image/png",
              data: imageBase64,
            },
          },
          {
            type: "text",
            text: `This screenshot image is ${w} pixels wide by ${h} pixels tall. Locate the following on screen: ${target}

A high-contrast coordinate grid is overlaid on the screenshot: columns A through T left to right (20 columns), rows 1 through 14 top to bottom (14 rows). Use the grid cells to place the target, then return the bounding box as normalized fractions (0–1) relative to the full image width and height (same pixel space as the screenshot under the grid).

If the target IS visible, return ONLY a JSON object using **normalized fractions** (decimals from 0 to 1, not pixels):
{ "found": true, "left": <0-1>, "top": <0-1>, "width": <0-1>, "height": <0-1>, "confidence": <0-1> }

- left: distance from the image's left edge to the tight bounding box's left edge, divided by the full image width
- top: distance from the image's top edge to the box's top edge, divided by the full image height
- width: box width divided by the full image width
- height: box height divided by the full image height

If the target is NOT visible, return ONLY a JSON object:
{ "found": false, "explanation": "<brief, helpful explanation of why it was not found and what the user can do to find it>" }

In the explanation, describe what you DO see on the screen and give the user practical advice for locating the target. For example: "The Docker taskbar is not visible on screen, so the Chrome icon cannot be located there. On a Mac, try hovering your mouse near the bottom of the screen to reveal the Dock. You could also use the magnifying glass icon at the top right to search for Chrome."`,
          },
        ],
      },
    ],
  });

  const raw = extractAssistantText(response).replace(/```json|```/g, "").trim();
  const parsed = parseAssistantJson(raw);

  if (parsed.found === false || parsed.found === "false") {
    return { found: false, explanation: parsed.explanation || "The target could not be located on screen." };
  }

  const box = normalizedBoxToPixels(parsed, w, h);
  if (box) return { found: true, ...box };

  return {
    found: true,
    x: parsed.x,
    y: parsed.y,
    width: parsed.width,
    height: parsed.height,
    confidence: parsed.confidence ?? 0,
  };
}

/**
 * Fast/cheap vision pass: is the target visible in this crop? No bounding box — skips expensive bbox calls on empty tiles.
 * Uses ANTHROPIC_MODEL_TILE_FAST (default Haiku). Image should be the downscaled crop without the coordinate grid.
 */
async function analyzeScreenshotTilePresence(imageBase64, targetDescription, imageWidth, imageHeight) {
  const { default: Anthropic } = await import("@anthropic-ai/sdk");
  require("dotenv/config");

  if (!process.env.ANTHROPIC_API_KEY) {
    return { found: false, explanation: "The assistant is not set up yet. Please ask your administrator to configure the API key and restart the app." };
  }

  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const display = screen.getPrimaryDisplay();
  const { width: logicalW, height: logicalH } = display.size;
  const w =
    typeof imageWidth === "number" && Number.isFinite(imageWidth) && imageWidth > 0
      ? Math.round(imageWidth)
      : logicalW;
  const h =
    typeof imageHeight === "number" && Number.isFinite(imageHeight) && imageHeight > 0
      ? Math.round(imageHeight)
      : logicalH;

  const target =
    typeof targetDescription === "string" && targetDescription.trim().length > 0
      ? targetDescription.trim()
      : "the Google Chrome app icon";

  const model =
    process.env.ANTHROPIC_MODEL_TILE_FAST || process.env.ANTHROPIC_MODEL || DEFAULT_VISION_MODEL;
  const response = await anthropicCreateWithRetry(client, {
    model,
    max_tokens: 128,
    messages: [
      {
        role: "user",
        content: [
          {
            type: "image",
            source: {
              type: "base64",
              media_type: "image/png",
              data: imageBase64,
            },
          },
          {
            type: "text",
            text: `You are a fast classifier for a small screen crop (${w}×${h} px).

Is this target visible anywhere in the image (fully or partially)? Target: ${target}

Reply with ONE JSON object only, no markdown:
{"present":true} or {"present":false}`,
          },
        ],
      },
    ],
  });

  const raw = extractAssistantText(response).replace(/```json|```/g, "").trim();
  const parsed = parseAssistantJson(raw);
  if (parsed.present === true || parsed.present === "true") return { present: true };
  if (parsed.present === false || parsed.present === "false") return { present: false };
  if (parsed.found === true || parsed.found === "true") return { present: true };
  if (parsed.found === false || parsed.found === "false") return { present: false };
  throw new SyntaxError(`Tile presence reply missing present: ${raw.slice(0, 120)}`);
}

/**
 * Cheap vision: is the target clipped by the crop edge? If so, which way should we expand the search?
 * Expects the same gridded tile image as analyzeScreenshotTile (8×8 grid).
 */
async function analyzeScreenshotTileClipHint(imageBase64, targetDescription, imageWidth, imageHeight) {
  const { default: Anthropic } = await import("@anthropic-ai/sdk");
  require("dotenv/config");

  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const display = screen.getPrimaryDisplay();
  const { width: logicalW, height: logicalH } = display.size;
  const w =
    typeof imageWidth === "number" && Number.isFinite(imageWidth) && imageWidth > 0
      ? Math.round(imageWidth)
      : logicalW;
  const h =
    typeof imageHeight === "number" && Number.isFinite(imageHeight) && imageHeight > 0
      ? Math.round(imageHeight)
      : logicalH;

  const target =
    typeof targetDescription === "string" && targetDescription.trim().length > 0
      ? targetDescription.trim()
      : "the Google Chrome app icon";

  const model =
    process.env.ANTHROPIC_MODEL_TILE_FAST || process.env.ANTHROPIC_MODEL || DEFAULT_VISION_MODEL;
  const response = await anthropicCreateWithRetry(client, {
    model,
    max_tokens: 256,
    messages: [
      {
        role: "user",
        content: [
          {
            type: "image",
            source: {
              type: "base64",
              media_type: "image/png",
              data: imageBase64,
            },
          },
          {
            type: "text",
            text: `This image is ONE crop from a desktop screenshot (${w}×${h} px), with an 8×8 coordinate grid.

Target: ${target}

Is this target visibly CUT OFF, CLIPPED, or partially OUTSIDE the image because the crop frame is too tight? (Say yes only if a meaningful part of the target is missing at an edge or clearly truncated.)

Reply with ONE JSON object only — no markdown, no extra text:
{"clipped":true|false,"direction":"<string>"}

For direction use EXACTLY one of: "none", "left", "right", "top", "bottom", "out"
- If clipped is false, use "none".
- If clipped is true: "left" = need to see more content to the LEFT of this frame; "right" / "top" / "bottom" = need more in that direction; "out" = need a wider view (zoom out / show more all around).`,
          },
        ],
      },
    ],
  });

  const raw = extractAssistantText(response).replace(/```json|```/g, "").trim();
  const parsed = parseAssistantJson(raw);
  const clipped =
    parsed.clipped === true || parsed.clipped === "true" || parsed.is_clipped === true || parsed.is_clipped === "true";
  let direction = typeof parsed.direction === "string" ? parsed.direction.trim().toLowerCase() : "none";
  const allowed = new Set(["none", "left", "right", "top", "bottom", "out", "zoom_out", "zoom out", "all"]);
  if (!allowed.has(direction)) {
    direction = "none";
  }
  if (direction === "zoom out" || direction === "zoom_out" || direction === "all") direction = "out";
  if (!clipped) direction = "none";

  return { clipped, direction };
}

/**
 * One screen tile: either { found: false } or normalized box in this tile's pixel grid (w×h).
 * @param {object} [callOpts]
 * @param {boolean} [callOpts.precise] Stronger model + budget: use when the crop is a small fraction of the desktop (tight box).
 */
async function analyzeScreenshotTile(imageBase64, targetDescription, imageWidth, imageHeight, callOpts = {}) {
  const { default: Anthropic } = await import("@anthropic-ai/sdk");
  require("dotenv/config");

  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const display = screen.getPrimaryDisplay();
  const { width: logicalW, height: logicalH } = display.size;
  const w =
    typeof imageWidth === "number" && Number.isFinite(imageWidth) && imageWidth > 0
      ? Math.round(imageWidth)
      : logicalW;
  const h =
    typeof imageHeight === "number" && Number.isFinite(imageHeight) && imageHeight > 0
      ? Math.round(imageHeight)
      : logicalH;

  const target =
    typeof targetDescription === "string" && targetDescription.trim().length > 0
      ? targetDescription.trim()
      : "the Google Chrome app icon";

  const precise = Boolean(callOpts && callOpts.precise);
  const fastModel =
    process.env.ANTHROPIC_MODEL_TILE_REFINE || process.env.ANTHROPIC_MODEL || DEFAULT_VISION_MODEL;
  const model = precise
    ? process.env.ANTHROPIC_MODEL_TILE_PRECISE || process.env.ANTHROPIC_MODEL || DEFAULT_TILE_PRECISE_MODEL
    : fastModel;
  const max_tokens = precise ? 2048 : 512;

  const tightnessNote = precise
    ? `

This is a HIGH-ZOOM crop (a small area of the original desktop). The bounding box must be TIGHT to the visible target: align left/top/right/bottom to the actual pixels of the object, not a loose rectangle. Use the 8×8 grid (columns a–h, rows 1–8, e.g. cell f3) to place edges; prefer slight under-margin to padding.

Think step-by-step internally, then output only the JSON object.`
    : "";

  const response = await anthropicCreateWithRetry(client, {
    model,
    max_tokens,
    messages: [
      {
        role: "user",
        content: [
          {
            type: "image",
            source: {
              type: "base64",
              media_type: "image/png",
              data: imageBase64,
            },
          },
          {
            type: "text",
            text: `This image is ONE rectangular crop from a larger desktop screenshot. The crop is ${w} pixels wide by ${h} pixels tall.

An 8×8 coordinate grid is overlaid on this crop only: columns a through h (left to right), rows 1 through 8 (top to bottom). Use the labeled cells to locate the target within this crop, then return normalized box coordinates relative to THIS crop only (0–1).

What to find: ${target}
${tightnessNote}

Reply with ONE JSON object only — no markdown, no text before or after the object.

If the target is NOT visible in this crop (even partially), use this shape (explanation: brief, crop-specific reason the target is absent or not identifiable here):
{"found":false,"explanation":"<string>"}

If the target IS visible (fully or partially), use:
{"found":true,"left":<0-1>,"top":<0-1>,"width":<0-1>,"height":<0-1>,"confidence":<0-1>}

When found is true, use normalized fractions relative to THIS crop only (top-left origin): left and top are the top-left corner of the tight box; width and height are box size divided by full crop width and height respectively.`,
          },
        ],
      },
    ],
  });

  const raw = extractAssistantText(response).replace(/```json|```/g, "").trim();
  const parsed = parseAssistantJson(raw);

  if (parsed.found === false || parsed.found === "false") {
    return {
      found: false,
      explanation:
        typeof parsed.explanation === "string" && parsed.explanation.trim().length > 0
          ? parsed.explanation.trim()
          : "The target is not visible in this crop.",
    };
  }

  const box = normalizedBoxToPixels(parsed, w, h);
  if (!box) {
    return {
      found: false,
      explanation:
        typeof parsed.explanation === "string" && parsed.explanation.trim().length > 0
          ? parsed.explanation.trim()
          : "Could not parse a valid bounding box from the model response.",
    };
  }
  return { found: true, ...box };
}

function errMessage(err) {
  return String(err?.message ?? err);
}

function createWindow() {
  const { width, height } = screen.getPrimaryDisplay().bounds;

  win = new BrowserWindow({
    x: 0,
    y: 0,
    width,
    height,

    frame: false,
    hasShadow: false,
    alwaysOnTop: true,
    transparent: true,
    skipTaskbar: true,

    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  win.setAlwaysOnTop(true, "screen-saver", 100);
  win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  win.moveTop();

  // Make the entire window click-through.
  setClickThrough(true, { forward: true });
  win.loadURL("http://localhost:3000");
}

ipcMain.on("set-ignore-mouse-events", (_event, ignore, options) => {
  setClickThrough(Boolean(ignore), options);
});

ipcMain.handle("request-screenshot-permission", async () => {
  if (screenshotPermissionGranted) return true;
  const { response } = await dialog.showMessageBox(win, {
    type: "question",
    buttons: ["Allow", "Deny"],
    defaultId: 0,
    cancelId: 1,
    title: "Screen Capture Permission",
    message: "Allow this app to take a screenshot of your screen?",
  });
  screenshotPermissionGranted = response === 0;
  return screenshotPermissionGranted;
});

ipcMain.handle("get-screen-sources", async () => {
  const sources = await desktopCapturer.getSources({ types: ["screen"] });
  return sources.map((source) => ({ id: source.id, name: source.name }));
});

/** Prefer the display the app window is on (usually primary) — avoids wrong resolution vs viewport. */
ipcMain.handle("get-primary-screen-media-source-id", async () => {
  const primary = screen.getPrimaryDisplay();
  const sources = await desktopCapturer.getSources({ types: ["screen"] });
  if (!sources.length) return null;
  const pid = primary.id;
  const match =
    sources.find((s) => s.display_id === String(pid)) ??
    sources.find((s) => Number(s.display_id) === pid) ??
    sources[0];
  return match.id;
});

ipcMain.handle("get-window-content-bounds", () => {
  if (!win || win.isDestroyed()) return null;
  return win.getContentBounds();
});

/** Same width/height used to create the fullscreen BrowserWindow (DIP / CSS space). */
ipcMain.handle("get-primary-display-bounds", () => {
  const b = screen.getPrimaryDisplay().bounds;
  return { x: b.x, y: b.y, width: b.width, height: b.height };
});

ipcMain.handle("analyze-screenshot", async (_event, base64, targetDescription, imageWidth, imageHeight) => {
  try {
    const result = await analyzeScreenshot(base64, targetDescription, imageWidth, imageHeight);
    if (result.found === false) {
      return { success: true, found: false, explanation: result.explanation };
    }
    const { found, ...data } = result;
    return { success: true, found: true, data };
  } catch (err) {
    console.error("analyze-screenshot error:", err);
    return { success: false, error: errMessage(err) };
  }
});

ipcMain.handle("analyze-screenshot-tile-presence", async (_event, base64, targetDescription, imageWidth, imageHeight) => {
  try {
    const r = await analyzeScreenshotTilePresence(base64, targetDescription, imageWidth, imageHeight);
    return { success: true, present: r.present };
  } catch (err) {
    console.error("analyze-screenshot-tile-presence error:", err);
    return { success: false, error: errMessage(err) };
  }
});

ipcMain.handle("analyze-screenshot-tile-clip-hint", async (_event, base64, targetDescription, imageWidth, imageHeight) => {
  try {
    const r = await analyzeScreenshotTileClipHint(base64, targetDescription, imageWidth, imageHeight);
    return { success: true, clipped: r.clipped, direction: r.direction };
  } catch (err) {
    console.error("analyze-screenshot-tile-clip-hint error:", err);
    return { success: false, error: errMessage(err) };
  }
});

ipcMain.handle("analyze-screenshot-tile", async (_event, base64, targetDescription, imageWidth, imageHeight, opts) => {
  try {
    const r = await analyzeScreenshotTile(base64, targetDescription, imageWidth, imageHeight, opts || {});
    if (!r.found) {
      return { success: true, found: false, explanation: r.explanation };
    }
    const { found, ...data } = r;
    return { success: true, found: true, data };
  } catch (err) {
    console.error("analyze-screenshot-tile error:", err);
    return { success: false, found: false, error: errMessage(err) };
  }
});

app.whenReady().then(() => {
  createWindow();

  // hotkey
  const shortcut = "CommandOrControl+Shift+Space";

  globalShortcut.register(shortcut, () => {
    if (!win) return;

    if (win.isVisible()) {
      win.hide();
    } else {
      win.show();
      win.setAlwaysOnTop(true, "screen-saver", 100);
      win.moveTop();
      win.focus();
    }
  });

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  // On macOS apps typically stay open until Cmd+Q
  if (process.platform !== "darwin") app.quit();
});

app.on("will-quit", () => {
  globalShortcut.unregisterAll();
});
