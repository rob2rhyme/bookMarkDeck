const { app, Tray, Menu, nativeImage } = require("electron");
const path = require("path");
const { startServer } = require("./server");

const PORT = Number(process.env.BOOKMARKDECK_PORT) || 47831;

let tray = null;
let serverHandle = null;

function createTray() {
  const icon = nativeImage.createEmpty();
  tray = new Tray(icon);
  tray.setToolTip("BookmarkDeck Launcher");

  const contextMenu = Menu.buildFromTemplate([
    { label: "Status: Running", enabled: false },
    { label: `Health Check: http://127.0.0.1:${PORT}/health`, enabled: false },
    { type: "separator" },
    {
      label: "Quit",
      click: () => {
        app.quit();
      },
    },
  ]);

  tray.setContextMenu(contextMenu);
}

async function shutdown() {
  try {
    if (serverHandle) {
      await serverHandle.stop();
      serverHandle = null;
    }
  } catch (error) {
    console.error("Failed to stop launcher server", error);
  }
}

app.whenReady().then(() => {
  serverHandle = startServer({ port: PORT });
  createTray();
});

app.on("before-quit", async (event) => {
  event.preventDefault();
  await shutdown();
  app.exit(0);
});

app.on("window-all-closed", (event) => {
  event.preventDefault();
});

app.on("activate", () => {
  if (!tray) createTray();
});
