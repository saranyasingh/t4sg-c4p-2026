const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("appInfo", {
  ping: () => "pong",
});

contextBridge.exposeInMainWorld("electronAPI", {
  requestScreenshotPermission: () => ipcRenderer.invoke("request-screenshot-permission"),
  getScreenSources: () => ipcRenderer.invoke("get-screen-sources"),
  analyzeScreenshot: (payload) => ipcRenderer.invoke("analyze-screenshot", payload),
});

window.addEventListener("DOMContentLoaded", () => {
  let isOverInteractable = false;

  // Default mode: whole window is click-through, but mouse movement is forwarded
  // so we can detect hover changes for interactable elements.
  ipcRenderer.send("set-ignore-mouse-events", true, { forward: true });

  window.addEventListener("mousemove", (event) => {
    const hovered = document.elementFromPoint(event.clientX, event.clientY);
    const nextIsOverInteractable = Boolean(hovered?.closest?.(".interactable"));

    if (nextIsOverInteractable === isOverInteractable) return;
    isOverInteractable = nextIsOverInteractable;

    if (isOverInteractable) {
      // Allow clicks while hovering an interactable region.
      ipcRenderer.send("set-ignore-mouse-events", false);
    } else {
      // Return to click-through when leaving interactable regions.
      ipcRenderer.send("set-ignore-mouse-events", true, { forward: true });
    }
  });
});
