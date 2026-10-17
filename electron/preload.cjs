const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("__ELECTRON__", {
  quit: () => ipcRenderer.send("app-quit"),
});
