const { app, BrowserWindow, screen } = require("electron");
const fs = require("fs");
const path = require("path");

// Default dimensions used on first launch (no saved bounds yet)
const DEFAULT_WIDTH = 1000;
const DEFAULT_HEIGHT = 700;

/**
 * @typedef {{ x: number, y: number, width: number, height: number }} Bounds
 */

/**
 * Load previously saved window bounds from a JSON file in the user-data directory.
 * Returns null if the file doesn't exist, is corrupted, or has invalid values,
 * so callers can fall back to defaults gracefully.
 * @returns {Bounds | null}
 */
function loadBounds() {
  const file = path.join(app.getPath("userData"), "window-bounds.json");
  try {
    const raw = fs.readFileSync(file, "utf8");
    // JSON.parse returns unknown; cast so we can validate the shape below
    const bounds = /** @type {Bounds} */ (JSON.parse(raw));
    // Ensure all four fields are present and the window has a real size
    if (
      typeof bounds.x === "number" &&
      typeof bounds.y === "number" &&
      typeof bounds.width === "number" &&
      typeof bounds.height === "number" &&
      bounds.width > 0 &&
      bounds.height > 0
    ) {
      return bounds;
    }
  } catch (_) {
    // File doesn't exist yet or is corrupted — silently use defaults
  }
  return null;
}

/**
 * Write the current window bounds to the user-data JSON file.
 * Failures (e.g. permissions) are silently ignored so they never crash the app.
 * @param {Bounds} bounds
 */
function saveBounds(bounds) {
  const file = path.join(app.getPath("userData"), "window-bounds.json");
  try {
    fs.writeFileSync(file, JSON.stringify(bounds));
  } catch (_) {
    // Silently ignore write failures
  }
}

/**
 * Guard rail: return true only if the saved bounds overlap at least one
 * display's work area. This prevents the window from being restored off-screen
 * when the user has unplugged or rearranged monitors between sessions.
 * @param {Bounds} bounds
 * @returns {boolean}
 */
function isOnScreen(bounds) {
  return screen.getAllDisplays().some((display) => {
    // Explicitly type workArea to avoid unsafe `any` member access
    const wa = /** @type {Bounds} */ (display.workArea);
    return (
      bounds.x < wa.x + wa.width &&
      bounds.x + bounds.width > wa.x &&
      bounds.y < wa.y + wa.height &&
      bounds.y + bounds.height > wa.y
    );
  });
}

function createWindow() {
  // Restore the last saved bounds if they're still on-screen; otherwise use defaults
  const saved = loadBounds();
  const windowBounds =
    saved && isOnScreen(saved) ? saved : { width: DEFAULT_WIDTH, height: DEFAULT_HEIGHT };

  const win = new BrowserWindow({
    ...windowBounds, // applies saved x, y, width, height (or just width/height for defaults)
    frame: false, // frameless window so webkit-app-region CSS can control dragging
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  win.loadURL("http://localhost:3000");

  // Debounce saves so we don't write to disk on every pixel of movement or resize
  /** @type {ReturnType<typeof setTimeout> | null} */
  let saveTimer = null;

  function scheduleSave() {
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      // Guard rail: skip saving in transient states (minimized windows report unreliable/zero bounds)
      if (!win.isMinimized() && !win.isMaximized()) {
        saveBounds(win.getBounds());
      }
    }, 500);
  }

  win.on("move", scheduleSave);
  win.on("resize", scheduleSave);

  // Last-chance save: ensures a quick move-then-close doesn't discard the new position
  win.on("close", () => {
    if (saveTimer) clearTimeout(saveTimer);
    if (!win.isMinimized() && !win.isMaximized()) {
      saveBounds(win.getBounds());
    }
  });
}

app.whenReady().then(() => {
  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  // On macOS apps typically stay open until Cmd+Q
  if (process.platform !== "darwin") app.quit();
});
