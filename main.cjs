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

async function analyzeScreenshot(imageBase64) {
  const client = await getOpenAI();
  const { z } = await import("zod");
  const { zodResponseFormat } = await import("openai/helpers/zod");

  const display = screen.getPrimaryDisplay();
  const { width, height } = display.size;

  const CoordinatesSchema = z.object({
    x: z.number().describe("X coordinate of the center of the Chrome icon"),
    y: z.number().describe("Y coordinate of the center of the Chrome icon"),
    width: z.number().describe("Width of the Chrome icon in pixels"),
    height: z.number().describe("Height of the Chrome icon in pixels"),
    confidence: z.number().describe("Confidence score between 0 and 1"),
  });

  const response = await client.chat.completions.create({
    model: "gpt-4o",
    messages: [
      {
        role: "system",
        content: `You are a computer vision assistant. The user will send you a screenshot of a computer screen with dimensions ${width}x${height} pixels.
Your job is to locate the Google Chrome app icon and return its exact pixel coordinates.
Return the center x,y of the icon plus its width and height.
Coordinates should be absolute pixel values with origin at top-left.`,
      },
      {
        role: "user",
        content: [
          { type: "image_url", image_url: { url: `data:image/png;base64,${imageBase64}` } },
          { type: "text", text: "Find the Google Chrome app icon and return its coordinates." },
        ],
      },
    ],
    response_format: zodResponseFormat(CoordinatesSchema, "coordinates"),
  });

  const raw = response.choices[0].message.content;
  if (!raw) throw new Error("No coordinates returned");
  return JSON.parse(raw);
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
    fullscreen: true,

    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  win.loadURL("http://localhost:3000");
  // invisible overlay
  win.setAlwaysOnTop(true, "screen-saver");
  win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });

  // Make the entire window click-through.
  setClickThrough(true, { forward: true });
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
