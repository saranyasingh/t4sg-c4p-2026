const { contextBridge } = require("electron");

contextBridge.exposeInMainWorld("appInfo", {
  ping: () => "pong",
});