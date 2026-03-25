const { app, BrowserWindow, desktopCapturer, dialog, ipcMain, globalShortcut, screen } = require("electron");
const path = require("path");

let win = null;
let openaiClient = null;
let screenshotPermissionGranted = false;

async function getOpenAI() {
  if (openaiClient) return openaiClient;
  const { default: OpenAI } = await import("openai");
  require("dotenv/config");
  openaiClient = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  return openaiClient;
}

async function analyzeScreenshot(imageBase64) {
  const { default: Anthropic } = await import("@anthropic-ai/sdk");
  require("dotenv/config");

  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  const display = screen.getPrimaryDisplay();
  const { width, height } = display.size;

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
            text: `This screenshot is displayed at ${width}x${height} logical pixels. Find the Google Chrome app icon and return ONLY a JSON object with: x (center x in logical pixels), y (center y in logical pixels), width (icon width in logical pixels), height (icon height in logical pixels), confidence (0-1). The coordinates must be in logical pixels matching the ${width}x${height} display size.`,
          },
        ],
      },
    ],
  });

  const raw = response.content[0].text;
  const clean = raw.replace(/```json|```/g, "").trim();
  const result = JSON.parse(clean);

  const scaleFactor = screen.getPrimaryDisplay().scaleFactor;
  if (result.x > width * scaleFactor * 0.8 || result.y > height * scaleFactor * 0.8) {
    result.x = Math.round(result.x / scaleFactor);
    result.y = Math.round(result.y / scaleFactor);
    result.width = Math.round(result.width / scaleFactor);
    result.height = Math.round(result.height / scaleFactor);
  }

  return JSON.parse(clean);
}

function createWindow() {
  const { width, height } = screen.getPrimaryDisplay().bounds;

  win = new BrowserWindow({
    x: 0,
    y: 0,
    width,
    height,

    frame: false,
    alwaysOnTop: true,
    transparent: true,
    skipTaskbar: true,

    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  win.loadURL("http://localhost:3000");
  // invisible overlay
  win.setAlwaysOnTop(true, "torn-off-menu");
  win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  win.setWindowButtonVisibility(false);
}

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

ipcMain.handle("analyze-screenshot", async (_event, base64) => {
  try {
    const coords = await analyzeScreenshot(base64);
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
