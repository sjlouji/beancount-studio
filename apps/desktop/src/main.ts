import { join } from "node:path";
import { pathToFileURL } from "node:url";

import { app, BrowserWindow, dialog, ipcMain, net, session, shell } from "electron";
import log from "electron-log/main";

import type { ConnectChannel, ConnectResult } from "./ipc";
import { healthUrl, isOnServer, normalizeServerUrl, ServerUrlError } from "./server-url";
import { readSettings, writeSettings } from "./settings";

log.initialize();

const CONNECT_CHANNEL: ConnectChannel = "server:connect";

const CONNECT_PAGE = pathToFileURL(join(__dirname, "..", "static", "connect.html")).href;
const HEALTH_TIMEOUT_MS = 5000;
const ERR_ABORTED = -3; // Chromium: navigation superseded by another one, not a failure.
const GRANTED_PERMISSIONS = new Set(["notifications", "clipboard-sanitized-write", "fullscreen"]);

let mainWindow: BrowserWindow | null = null;
let serverOrigin: string | null = null;

function describe(error: unknown): string {
  if (!(error instanceof Error)) return String(error);
  // Node and Chromium wrap network failures: "fetch failed" with the real reason in `cause`.
  const cause = error.cause;
  const reason = cause instanceof Error ? cause.message : typeof cause === "string" ? cause : "";
  return reason ? `${error.message}: ${reason}` : error.message;
}

function isConnectPage(url: string): boolean {
  return url.split("?")[0] === CONNECT_PAGE;
}

function isAllowedNavigation(url: string): boolean {
  return isConnectPage(url) || (serverOrigin !== null && isOnServer(url, serverOrigin));
}

function openExternal(url: string): void {
  if (URL.canParse(url) && /^https?:$/.test(new URL(url).protocol)) {
    void shell.openExternal(url);
    return;
  }
  log.warn("blocked navigation to", url);
}

async function showConnect(state: { url?: string; error?: string } = {}): Promise<void> {
  const params = new URLSearchParams();
  if (state.url) params.set("url", state.url);
  if (state.error) params.set("error", state.error);
  const query = params.toString();
  await mainWindow?.loadURL(query ? `${CONNECT_PAGE}?${query}` : CONNECT_PAGE);
}

async function loadServer(origin: string): Promise<void> {
  serverOrigin = origin;
  log.info("loading server", origin);
  try {
    await mainWindow?.loadURL(origin);
  } catch (error) {
    // did-fail-load has already switched to the connect screen, which supersedes this
    // navigation and rejects it with ERR_ABORTED; anything else is unexpected.
    const errno = (error as { errno?: number }).errno;
    if (errno === ERR_ABORTED) {
      log.debug("loadURL superseded", origin);
    } else {
      log.warn("loadURL rejected", origin, describe(error));
    }
  }
}

async function checkServer(origin: string): Promise<void> {
  // Chromium's network stack, not Node's fetch: it honours the operating system's trust store,
  // so a locally trusted certificate authority (the `local` stack) is accepted like in a browser.
  const response = await net.fetch(healthUrl(origin), { signal: AbortSignal.timeout(HEALTH_TIMEOUT_MS) });
  if (!response.ok) {
    throw new Error(`${origin} answered HTTP ${response.status} on /api/healthz`);
  }
}

function createWindow(): BrowserWindow {
  const window = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 960,
    minHeight: 640,
    title: "Beancount Studio",
    show: false,
    backgroundColor: "#f4ede4",
    webPreferences: {
      preload: join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      additionalArguments: [`--studio-version=${app.getVersion()}`],
    },
  });
  window.once("ready-to-show", () => window.show());

  window.webContents.on("will-navigate", (event, url) => {
    if (isAllowedNavigation(url)) return;
    event.preventDefault();
    openExternal(url);
  });
  window.webContents.setWindowOpenHandler(({ url }) => {
    openExternal(url);
    return { action: "deny" };
  });
  window.webContents.on("did-fail-load", (_event, code, description, url, isMainFrame) => {
    if (!isMainFrame || code === ERR_ABORTED) return;
    log.error("load failed", { code, description, url });
    void showConnect({ url: serverOrigin ?? url, error: `Could not load ${url}: ${description} (${code}).` });
  });
  window.on("closed", () => {
    mainWindow = null;
  });
  return window;
}

function configureSession(): void {
  const granted = (requestingUrl: string, permission: string): boolean =>
    GRANTED_PERMISSIONS.has(permission) && serverOrigin !== null && isOnServer(requestingUrl, serverOrigin);
  session.defaultSession.setPermissionRequestHandler((contents, permission, callback) => {
    const allow = granted(contents.getURL(), permission);
    if (!allow) log.warn("permission denied", permission, contents.getURL());
    callback(allow);
  });
  session.defaultSession.setPermissionCheckHandler((_contents, permission, requestingOrigin) =>
    granted(requestingOrigin, permission),
  );
}

ipcMain.handle(CONNECT_CHANNEL, async (event, input: unknown): Promise<ConnectResult> => {
  const sender = event.senderFrame?.url ?? "";
  if (!isConnectPage(sender)) {
    log.warn("server:connect rejected, sender is not the connect screen", sender);
    return { ok: false, error: "Only the connect screen may change the server." };
  }
  if (typeof input !== "string") {
    return { ok: false, error: "Enter the address of your Beancount Studio server." };
  }
  let origin: string;
  try {
    origin = normalizeServerUrl(input);
  } catch (error) {
    if (!(error instanceof ServerUrlError)) throw error;
    log.warn("server address rejected", input, error.message);
    return { ok: false, error: error.message };
  }
  try {
    await checkServer(origin);
  } catch (error) {
    log.error("server check failed", origin, error);
    return { ok: false, error: `Could not reach ${origin}: ${describe(error)}` };
  }
  writeSettings({ serverUrl: origin });
  await loadServer(origin);
  return { ok: true };
});

async function start(): Promise<void> {
  const { settings, problem } = readSettings();
  const target = process.env.STUDIO_SERVER_URL ?? settings.serverUrl;
  if (!target) {
    await showConnect({ error: problem });
    return;
  }
  try {
    await loadServer(normalizeServerUrl(target));
  } catch (error) {
    log.error("saved server address is unusable", target, error);
    await showConnect({ url: target, error: describe(error) });
  }
}

app.on("web-contents-created", (_event, contents) => {
  contents.on("will-attach-webview", (event) => {
    event.preventDefault();
    log.warn("blocked a <webview> tag");
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

app
  .whenReady()
  .then(async () => {
    configureSession();
    mainWindow = createWindow();
    await start();
    app.on("activate", () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        mainWindow = createWindow();
        void start();
      }
    });
  })
  .catch((error: unknown) => {
    log.error("startup failed", error);
    dialog.showErrorBox("Beancount Studio could not start", describe(error));
    app.quit();
  });
