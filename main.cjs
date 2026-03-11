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
  win.setAlwaysOnTop(true, "screen-saver");
  win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  win.focus();
  win.setPosition(0, 0);
}

async function analyzeScreenshot(imageBase64) {
  const client = await getOpenAI();
  const fs = require("fs");

  const tmpPath = "/tmp/screenshot.png";
  fs.writeFileSync(tmpPath, Buffer.from(imageBase64, "base64"));

  const file = await client.files.create({
    file: fs.createReadStream(tmpPath),
    purpose: "vision",
  });

  const assistant = await client.beta.assistants.create({
    model: "gpt-4o",
    tools: [{ type: "code_interpreter" }],
    instructions: `You are a computer vision assistant. You MUST always run Python code using code_interpreter to analyze images. Never guess. Always execute code first. Return ONLY raw JSON, no markdown, no explanation.`,
  });

  const threadObj = await client.beta.threads.create({
    messages: [
      {
        role: "user",
        content: [
          {
            type: "text",
            text: `Using code_interpreter, run Python code to find the Google Chrome icon in the attached image. The Chrome icon has a red, green, yellow outer ring and blue center. It could be any size. Find the largest instance of it (ignore tiny favicons under 20px). Return ONLY this raw JSON with no markdown: {"x": center_x, "y": center_y, "width": icon_width, "height": icon_height, "confidence": 0.99}`,
          },
        ],
        attachments: [
          {
            file_id: file.id,
            tools: [{ type: "code_interpreter" }],
          },
        ],
      },
    ],
  });

  const tId = threadObj.id;
  let run = await client.beta.threads.runs.create(tId, {
    assistant_id: assistant.id,
    tool_choice: { type: "code_interpreter" },
  });
  const rId = run.id;

  let runStatus = run.status;
  while (runStatus === "queued" || runStatus === "in_progress") {
    await new Promise((r) => setTimeout(r, 1000));
    const updatedRun = await client.beta.threads.runs.retrieve(rId, { thread_id: tId });
    runStatus = updatedRun.status;
    console.log("Status:", runStatus);
  }

  if (runStatus === "failed") {
    const failedRun = await client.beta.threads.runs.retrieve(rId, { thread_id: tId });
    console.log("Run failed reason:", JSON.stringify(failedRun.last_error));
  }

  const messages = await client.beta.threads.messages.list(tId);
  const content = messages.data[0].content[0];
  if (content.type !== "text") throw new Error("Unexpected response type");

  await client.files.delete(file.id);
  await client.beta.assistants.delete(assistant.id);

  console.log("Assistant response:", content.text.value);
  const raw = content.text.value.replace(/```json|```/g, "").trim();
  return JSON.parse(raw);
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
