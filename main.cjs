const { app, BrowserWindow, desktopCapturer, dialog, ipcMain, globalShortcut, screen } = require("electron");
const path = require("path");

/** @type {import("electron").BrowserWindow | null} */
let win = null;
let screenshotPermissionGranted = false;

/** @param {boolean} enabled @param {import("electron").IgnoreMouseEventsOptions | undefined} options */
function setClickThrough(enabled, options) {
  if (!win) return;
  win.setIgnoreMouseEvents(enabled, options);
}

/** @param {string} imageBase64 @param {number} captureWidth @param {number} captureHeight */
async function analyzeScreenshot(imageBase64, captureWidth, captureHeight) {
  const { default: Anthropic, toFile } = await import("@anthropic-ai/sdk");
  require("dotenv/config");

  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const display = screen.getPrimaryDisplay();
  const { width: logicalW, height: logicalH } = display.size;
  const cw = captureWidth > 0 ? captureWidth : logicalW;
  const ch = captureHeight > 0 ? captureHeight : logicalH;

  const buffer = Buffer.from(imageBase64, "base64");
  const betas = ["files-api-2025-04-14"];

  let fileId = null;
  try {
    const upload = await client.beta.files.upload({
      file: await toFile(buffer, "screen.png", { type: "image/png" }),
      betas,
    });
    fileId = upload.id;

    const promptText = `The image is a screenshot bitmap of size ${cw} x ${ch} pixels. The user's display uses ${logicalW} x ${logicalH} logical (CSS) pixels for overlay positioning.

Find the Google Chrome app icon. Measure its bounding box in **bitmap pixels** (origin top-left of the image).

Return ONLY a JSON object with:
- x: center x in bitmap pixels
- y: center y in bitmap pixels  
- width: icon width in bitmap pixels
- height: icon height in bitmap pixels
- confidence: number from 0 to 1`;

    const response = await client.beta.messages.create({
      model: "claude-opus-4-6",
      max_tokens: 1024,
      betas,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "image",
              source: { type: "file", file_id: fileId },
            },
            { type: "text", text: promptText },
          ],
        },
      ],
    });

    const textBlock = response.content.find((b) => b.type === "text");
    if (!textBlock || textBlock.type !== "text") {
      throw new Error("Claude response had no text block");
    }
    const raw = textBlock.text;
    const clean = raw.replace(/```json|```/g, "").trim();
    const parsedUnknown = JSON.parse(clean);
    const parsed = /** @type {{ x: number; y: number; width: number; height: number; confidence: number }} */ (
      parsedUnknown
    );

    const bx = Number(parsed.x);
    const by = Number(parsed.y);
    const bw = Number(parsed.width);
    const bh = Number(parsed.height);

    const scaleX = logicalW / cw;
    const scaleY = logicalH / ch;

    return {
      x: Math.round(bx * scaleX),
      y: Math.round(by * scaleY),
      width: Math.max(1, Math.round(bw * scaleX)),
      height: Math.max(1, Math.round(bh * scaleY)),
      confidence: Number(parsed.confidence),
    };
  } finally {
    if (fileId) {
      try {
        await client.beta.files.delete(fileId, { betas });
      } catch (err) {
        console.warn("analyzeScreenshot: file delete failed", err);
      }
    }
  }
}

function createWindow() {
  const display = screen.getPrimaryDisplay();
  const isDarwin = process.platform === "darwin";
  const full = display.bounds;
  const work = display.workArea;

  /**
   * macOS: `bounds` includes the menu-bar strip; a full-screen window is drawn underneath it and looks
   * “cut off”. Use `workArea` for x / top / width, but extend height to the bottom of the display so we
   * still fill down to the dock edge (workArea often stops above the dock).
   */
  const rect = isDarwin
    ? {
        x: work.x,
        y: work.y,
        width: work.width,
        height: full.y + full.height - work.y,
      }
    : { x: full.x, y: full.y, width: full.width, height: full.height };

  win = new BrowserWindow({
    x: rect.x,
    y: rect.y,
    width: rect.width,
    height: rect.height,

    frame: true,
    fullscreen: !isDarwin,
    simpleFullscreen: false,
    /** Lets content use the title-bar region; window frame still aligns with workArea on macOS. */
    ...(isDarwin
      ? {
          titleBarStyle: "hiddenInset",
          trafficLightPosition: { x: 12, y: 12 },
        }
      : {}),
    alwaysOnTop: true,
    transparent: true,
    skipTaskbar: true,

    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  win.setAlwaysOnTop(true, "torn-off-menu");
  win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });

  setClickThrough(true, { forward: true });
  win.loadURL("http://localhost:3000");
}

ipcMain.on("set-ignore-mouse-events", (_event, ignore, options) => {
  setClickThrough(Boolean(ignore), options);
});

ipcMain.handle("request-screenshot-permission", async () => {
  if (screenshotPermissionGranted) return true;
  if (!win) return false;
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

ipcMain.handle("analyze-screenshot", async (_event, payload) => {
  try {
    const base64 = typeof payload === "string" ? payload : payload?.base64;
    const captureWidth = typeof payload === "object" && payload ? Number(payload.captureWidth) || 0 : 0;
    const captureHeight = typeof payload === "object" && payload ? Number(payload.captureHeight) || 0 : 0;
    if (!base64) {
      return { success: false, error: "Missing image data" };
    }
    const coords = await analyzeScreenshot(base64, captureWidth, captureHeight);
    return { success: true, data: coords };
  } catch (err) {
    console.error("analyze-screenshot error:", err);
    return { success: false, error: err instanceof Error ? err.message : String(err) };
  }
});

app.whenReady().then(() => {
  createWindow();

  const shortcut = "CommandOrControl+Shift+Space";

  globalShortcut.register(shortcut, () => {
    if (!win) return;

    if (win.isVisible()) {
      win.hide();
    } else {
      win.show();
      win.focus();
    }
  });

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

app.on("will-quit", () => {
  globalShortcut.unregisterAll();
});
