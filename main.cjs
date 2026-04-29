// @ts-nocheck
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
      if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
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
 * `requestOptions` is forwarded to `messages.create` (headers, timeout, etc.).
 */
async function anthropicCreateWithRetry(client, body, requestOptions, { maxRetries = 8 } = {}) {
  let lastErr;
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return requestOptions ? await client.messages.create(body, requestOptions) : await client.messages.create(body);
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
    hiddenInMissionControl: process.platform === "darwin",

    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  win.setAlwaysOnTop(true, "screen-saver", 100);
  win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  if (process.platform === "darwin") {
    win.setHiddenInMissionControl(true);
  }
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

/**
 * Computer Use API: find the exact center pixel of a UI element.
 * Uses Claude's Computer Use beta (pixel-accurate coordinate training).
 * Returns { found: true, x, y } in original screenshot pixel space,
 * or { found: false, explanation }.
 */
const DEFAULT_COMPUTER_USE_MODEL = "claude-haiku-4-5-20251001";
const COMPUTER_USE_MAX_LONG_EDGE = 1280;
const COMPUTER_USE_TIMEOUT_MS = 30_000;

/** Scale the capture down so the long edge is ≤ MAX while keeping aspect ratio (avoids distorted coords). */
function scaleForComputerUse(origW, origH) {
  const long = Math.max(origW, origH);
  if (long <= COMPUTER_USE_MAX_LONG_EDGE) return { w: origW, h: origH };
  const s = COMPUTER_USE_MAX_LONG_EDGE / long;
  return { w: Math.max(1, Math.round(origW * s)), h: Math.max(1, Math.round(origH * s)) };
}

/** Pick the first tool_use block with a usable (x, y) — tolerates `mouse_move`, `left_click`, etc. */
function extractComputerUseCoordinate(content) {
  if (!Array.isArray(content)) return null;
  for (const block of content) {
    if (block?.type !== "tool_use" || block.name !== "computer") continue;
    const input = block.input;
    if (!input || input.action === "screenshot") continue;
    if (!Array.isArray(input.coordinate) || input.coordinate.length < 2) continue;
    const cx = Number(input.coordinate[0]);
    const cy = Number(input.coordinate[1]);
    if (!Number.isFinite(cx) || !Number.isFinite(cy)) continue;
    return { cx, cy, action: String(input.action ?? "") };
  }
  return null;
}

/**
 * Pre-flight visibility check using a normal vision model (NOT Computer Use).
 * Computer Use models, when forced via tool_choice, will hallucinate coordinates
 * even for off-screen targets — so we ask plainly first whether the element is
 * actually visible. Returns { visible: true } when the verifier confirms, or
 * { visible: false, reason } when it doesn't.
 */
async function verifyTargetVisible(client, resizedBase64, target) {
  const verifierModel =
    process.env.ANTHROPIC_MODEL_VISION || process.env.ANTHROPIC_MODEL || "claude-haiku-4-5-20251001";

  const response = await anthropicCreateWithRetry(
    client,
    {
      model: verifierModel,
      max_tokens: 200,
      system:
        "You verify whether a UI element is currently visible in a screenshot. " +
        "Respond with a single line of strict JSON only — no prose, no code fences. " +
        'Schema: {"visible": boolean, "reason": string}. ' +
        'Set "visible" to true ONLY if the described element is clearly present and identifiable in the image. ' +
        'If the relevant app/window is not open, the element is off-screen, partially obscured beyond recognition, or you are not confident, set "visible" to false and put a one-sentence plain-language reason in "reason".',
      messages: [
        {
          role: "user",
          content: [
            {
              type: "image",
              source: { type: "base64", media_type: "image/png", data: resizedBase64 },
            },
            {
              type: "text",
              text: `Target element: ${target}\n\nIs this target currently visible on the screenshot?`,
            },
          ],
        },
      ],
    },
    { timeout: COMPUTER_USE_TIMEOUT_MS },
  );

  const textBlock = response.content?.find?.((b) => b.type === "text");
  const raw = (textBlock?.text ?? "").trim();
  const jsonMatch = raw.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    console.warn("verifyTargetVisible: no JSON in response:", raw.slice(0, 200));
    return { visible: true, reason: "" };
  }
  try {
    const parsed = JSON.parse(jsonMatch[0]);
    return {
      visible: parsed.visible === true,
      reason: typeof parsed.reason === "string" ? parsed.reason.trim() : "",
    };
  } catch (err) {
    console.warn("verifyTargetVisible: parse failed:", err?.message, "raw:", raw.slice(0, 200));
    return { visible: true, reason: "" };
  }
}

async function locateElementComputerUse(imageBase64, targetDescription, imageWidth, imageHeight) {
  const { default: Anthropic } = await import("@anthropic-ai/sdk");
  require("dotenv/config");

  if (!process.env.ANTHROPIC_API_KEY) {
    return {
      found: false,
      explanation:
        "The assistant is not set up yet. Please ask your administrator to configure the API key and restart the app.",
    };
  }

  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const display = screen.getPrimaryDisplay();
  const { width: logicalW, height: logicalH } = display.size;

  const origW = typeof imageWidth === "number" && imageWidth > 0 ? Math.round(imageWidth) : logicalW;
  const origH = typeof imageHeight === "number" && imageHeight > 0 ? Math.round(imageHeight) : logicalH;
  const target =
    typeof targetDescription === "string" && targetDescription.trim()
      ? targetDescription.trim()
      : "the main interactive element";

  const cu = scaleForComputerUse(origW, origH);
  const { nativeImage } = require("electron");
  const img = nativeImage.createFromBuffer(Buffer.from(imageBase64, "base64"));
  const resized = cu.w === origW && cu.h === origH ? img : img.resize({ width: cu.w, height: cu.h, quality: "good" });
  const resizedBase64 = resized.toPNG().toString("base64");

  // Step 1: pre-verification. Bail before Computer Use if the element clearly isn't on screen.
  const verdict = await verifyTargetVisible(client, resizedBase64, target);
  if (!verdict.visible) {
    return {
      found: false,
      explanation: verdict.reason || "Element not found on screen.",
    };
  }

  const model = process.env.ANTHROPIC_MODEL_COMPUTER_USE || process.env.ANTHROPIC_MODEL || DEFAULT_COMPUTER_USE_MODEL;

  // Step 2: Computer Use locate. tool_choice is "auto" + the prompt explicitly allows
  // the model to refuse with "NOT_FOUND: <reason>" so a wrong verifier verdict can still bail.
  const response = await anthropicCreateWithRetry(
    client,
    {
      model,
      max_tokens: 1024,
      system:
        `You are a screen annotation assistant. A screenshot (${cu.w}x${cu.h} px) is already provided — you MUST NOT call screenshot.\n\n` +
        `Your task: locate the target element on the screen.\n` +
        `- If the target IS clearly visible, call the computer tool ONCE with action "mouse_move" and the coordinate of its exact center pixel. No text, no click, no other tool calls.\n` +
        `- If the target is NOT visible (relevant app/window not open, off-screen, or not identifiable), DO NOT call the tool. Reply with a single line of plain text starting exactly with "NOT_FOUND: " followed by a brief one-sentence reason in plain language.`,
      tools: [
        {
          type: "computer_20250124",
          name: "computer",
          display_width_px: cu.w,
          display_height_px: cu.h,
        },
      ],
      tool_choice: { type: "auto" },
      messages: [
        {
          role: "user",
          content: [
            {
              type: "image",
              source: { type: "base64", media_type: "image/png", data: resizedBase64 },
            },
            {
              type: "text",
              text: `Target: ${target}\n\nFollow the rules in the system prompt: emit a mouse_move tool call if visible, otherwise reply with "NOT_FOUND: <reason>".`,
            },
          ],
        },
      ],
    },
    {
      headers: { "anthropic-beta": "computer-use-2025-01-24" },
      timeout: COMPUTER_USE_TIMEOUT_MS,
    },
  );

  const coord = extractComputerUseCoordinate(response.content);
  if (coord) {
    const scale = origW / cu.w;
    return {
      found: true,
      x: Math.round(coord.cx * scale),
      y: Math.round(coord.cy * scale),
    };
  }

  const textBlock = response.content.find((b) => b.type === "text");
  const rawText = (textBlock?.text ?? "").trim();
  const notFoundMatch = rawText.match(/^NOT_FOUND:\s*(.*)$/i);
  const explanation = notFoundMatch?.[1]?.trim() || rawText || "Element not found on screen.";

  const blockSummary = response.content
    .map((b) => (b.type === "tool_use" ? `tool_use:${b.name}:${b.input?.action ?? "?"}` : b.type))
    .join(", ");
  console.warn("locateElementComputerUse: no coordinate in response. blocks:", blockSummary, "text:", rawText);
  return {
    found: false,
    explanation,
  };
}

ipcMain.handle("locate-element-computer-use", async (_event, base64, targetDescription, imageWidth, imageHeight) => {
  try {
    const result = await locateElementComputerUse(base64, targetDescription, imageWidth, imageHeight);
    return { success: true, ...result };
  } catch (err) {
    console.error("locate-element-computer-use error:", err);
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
