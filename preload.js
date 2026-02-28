const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("appInfo", {
  ping: () => "pong",
});

contextBridge.exposeInMainWorld("electronAPI", {
  requestScreenshotPermission: () => ipcRenderer.invoke("request-screenshot-permission"),
  getScreenSources: () => ipcRenderer.invoke("get-screen-sources"),
});