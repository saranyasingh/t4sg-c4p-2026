const { app, BrowserWindow, desktopCapturer, dialog, ipcMain, globalShortcut, screen } = require("electron");
const path = require("path");

let win = null;
let openaiClient = null;
let screenshotPermissionGranted = false;

function setClickThrough(enabled, options) {
  if (!win) return;
  win.setIgnoreMouseEvents(enabled, options);
}

async function getOpenAI() {
  if (openaiClient) return openaiClient;
  const { default: OpenAI } = await import("openai");
  require("dotenv/config");
  openaiClient = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  return openaiClient;
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

  const response = await client.messages.create({
    model: "claude-opus-4-6",
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

  const textBlock = response.content.find((b) => b.type === "text");
  const raw = textBlock?.text ?? response.content[0]?.text ?? "";
  const clean = raw.replace(/```json|```/g, "").trim();
  const parsed = JSON.parse(clean);

  const toNum = (v) => {
    if (typeof v === "number" && Number.isFinite(v)) return v;
    if (typeof v === "string" && v.trim() !== "") {
      const n = Number(v);
      if (Number.isFinite(n)) return n;
    }
    return NaN;
  };

  const leftN = toNum(parsed.left);
  const topN = toNum(parsed.top);
  const widthN = toNum(parsed.width);
  const heightN = toNum(parsed.height);

  if ([leftN, topN, widthN, heightN].every((n) => Number.isFinite(n))) {
    const clamp01 = (n) => Math.max(0, Math.min(1, n));
    const left = clamp01(leftN);
    const top = clamp01(topN);
    const fw = clamp01(widthN);
    const fh = clamp01(heightN);
    const confRaw = toNum(parsed.confidence);
    console.log(left * w, top * h, fw * w, fh * h);
    return {
      x: left * w,
      y: top * h,
      width: fw * w,
      height: fh * h,
      confidence: Number.isFinite(confRaw) ? clamp01(confRaw) : 0,
    };
  }

  return {
    x: parsed.x,
    y: parsed.y,
    width: parsed.width,
    height: parsed.height,
    confidence: parsed.confidence ?? 0,
  };
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
