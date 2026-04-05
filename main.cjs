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

async function analyzeScreenshot(imageBase64, targetDescription, imageWidth, imageHeight) {
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
      : "the Google Chrome app icon on the desktop, taskbar, or Dock";

  const model = process.env.ANTHROPIC_MODEL || "claude-sonnet-4-20250514";
  const response = await client.messages.create({
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

Return ONLY a JSON object using **normalized fractions** (decimals from 0 to 1, not pixels):
- left: distance from the image's left edge to the tight bounding box's left edge, divided by the full image width
- top: distance from the image's top edge to the box's top edge, divided by the full image height
- width: box width divided by the full image width
- height: box height divided by the full image height
- confidence: 0 to 1

Example: a small icon centered horizontally near the bottom might look like { "left": 0.48, "top": 0.88, "width": 0.04, "height": 0.06, "confidence": 0.9 }`,
          },
        ],
      },
    ],
  });

  const raw = extractAssistantText(response).replace(/```json|```/g, "").trim();
  const parsed = JSON.parse(raw);

  const box = normalizedBoxToPixels(parsed, w, h);
  if (box) return box;

  return {
    x: parsed.x,
    y: parsed.y,
    width: parsed.width,
    height: parsed.height,
    confidence: parsed.confidence ?? 0,
  };
}

/**
 * One screen tile: either { found: false } or normalized box in this tile's pixel grid (w×h).
 */
async function analyzeScreenshotTile(imageBase64, targetDescription, imageWidth, imageHeight) {
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
  console.log(target);
  const model = process.env.ANTHROPIC_MODEL || "claude-sonnet-4-20250514";
  const response = await client.messages.create({
    model,
    max_tokens: 512,
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

What to find: ${target}

If the target is NOT visible in this crop (even partially), return ONLY this JSON: {"found":false}

If the target IS visible (fully or partially), return ONLY this JSON:
{"found":true,"left":<0-1>,"top":<0-1>,"width":<0-1>,"height":<0-1>,"confidence":<0-1>}

When found is true, use normalized fractions relative to THIS crop only (top-left origin): left and top are the top-left corner of the tight box; width and height are box size divided by full crop width and height respectively.`,
          },
        ],
      },
    ],
  });

  const raw = extractAssistantText(response).replace(/```json|```/g, "").trim();
  const parsed = JSON.parse(raw);

  if (parsed.found === false || parsed.found === "false") {
    return { found: false };
  }

  const box = normalizedBoxToPixels(parsed, w, h);
  if (!box) return { found: false };
  return { found: true, ...box };
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

  // invisible overlay
  // Use a higher always-on-top level so highlights can appear over system UI (e.g., Dock on macOS).
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
    const coords = await analyzeScreenshot(base64, targetDescription, imageWidth, imageHeight);
    return { success: true, data: coords };
  } catch (err) {
    console.error("analyze-screenshot error:", err);
    return { success: false, error: err.message };
  }
});

ipcMain.handle("analyze-screenshot-tile", async (_event, base64, targetDescription, imageWidth, imageHeight) => {
  try {
    const r = await analyzeScreenshotTile(base64, targetDescription, imageWidth, imageHeight);
    if (!r.found) return { success: true, found: false };
    const { found, ...data } = r;
    return { success: true, found: true, data };
  } catch (err) {
    console.error("analyze-screenshot-tile error:", err);
    return { success: false, found: false, error: err.message };
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
