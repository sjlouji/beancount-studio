import { join } from "node:path";
import { pathToFileURL } from "node:url";

import { app, BrowserWindow, dialog, ipcMain, Menu, net, session, shell } from "electron";
import log from "electron-log/main";

import type { DesktopWorkspace, DesktopWorkspaceUpdate } from "@beancount-studio/desktop-bridge";

import { DEEP_LINK_SCHEME, parseOpenDeepLink } from "./deep-link";
import type { ConnectChannel, ConnectResult, SignInCancelChannel, SignInReopenChannel, WorkspacesChannel } from "./ipc";
import { dockMenuEntries, workspaceMenuEntries, type WorkspaceMenuEntry } from "./menu";
import { healthUrl, isOnServer, normalizeServerUrl, ServerUrlError } from "./server-url";
import { readSettings, writeSettings } from "./settings";
import {
  authPageNext,
  createSignInChallenge,
  isAuthPage,
  parseSignedInDeepLink,
  signInUrl,
  type SignInChallenge,
} from "./sign-in";

log.initialize();

const CONNECT_CHANNEL: ConnectChannel = "server:connect";
const SIGN_IN_REOPEN_CHANNEL: SignInReopenChannel = "sign-in:reopen";
const SIGN_IN_CANCEL_CHANNEL: SignInCancelChannel = "sign-in:cancel";
const WORKSPACES_CHANNEL: WorkspacesChannel = "workspaces:update";

const CONNECT_PAGE = pathToFileURL(join(__dirname, "..", "static", "connect.html")).href;
const REQUEST_TIMEOUT_MS = 5000;
const SIGN_IN_POLL_MS = 2000;
const SIGN_IN_TIMEOUT_MS = 10 * 60 * 1000;
const ERR_ABORTED = -3; // Chromium: navigation superseded by another one, not a failure.
const GRANTED_PERMISSIONS = new Set(["notifications", "clipboard-sanitized-write", "fullscreen"]);
// Bounds on what a server page may put in the Workspace menu.
const MAX_WORKSPACES = 50;
const WORKSPACE_SLUG = /^[a-z0-9-]{1,40}$/;
const WORKSPACE_ROLES = new Set(["owner", "admin", "member", "viewer"]);

interface PendingSignIn {
  origin: string;
  secret: SignInChallenge;
  startedAt: number;
  timer: NodeJS.Timeout;
  polling: boolean;
}

let mainWindow: BrowserWindow | null = null;
let serverOrigin: string | null = null;
let pendingSignIn: PendingSignIn | null = null;
/** A page to open on the server as soon as it is loaded and signed in (deep link, or the server's own `next`). */
let pendingPath: string | null = null;
let workspaces: DesktopWorkspaceUpdate | null = null;

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
  setWorkspaces(null);
  await mainWindow?.loadURL(query ? `${CONNECT_PAGE}?${query}` : CONNECT_PAGE);
}

async function showWaiting(origin: string): Promise<void> {
  const params = new URLSearchParams({ waiting: "1", url: origin });
  await mainWindow?.loadURL(`${CONNECT_PAGE}?${params}`);
}

/** Loads a page of the server: the pending one if any, else `path`, else the front page. */
async function loadServer(origin: string, path?: string): Promise<void> {
  const target = pendingPath ?? path ?? "/";
  pendingPath = null;
  const url = new URL(target, origin).href;
  log.info("loading", url);
  try {
    await mainWindow?.loadURL(url);
  } catch (error) {
    // did-fail-load has already switched to the connect screen, which supersedes this
    // navigation and rejects it with ERR_ABORTED; anything else is unexpected.
    const errno = (error as { errno?: number }).errno;
    if (errno === ERR_ABORTED) {
      log.debug("loadURL superseded", url);
    } else {
      log.warn("loadURL rejected", url, describe(error));
    }
  }
}

/**
 * Requests to the server go through Chromium's network stack, not Node's fetch: it honours the
 * operating system's trust store (so a locally trusted certificate authority works) and shares
 * the window's cookie jar, so a session obtained here is the window's session.
 */
function fetchServer(origin: string, path: string, init: RequestInit = {}): Promise<Response> {
  return net.fetch(new URL(path, origin).href, {
    ...init,
    credentials: "include",
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
}

async function checkServer(origin: string): Promise<void> {
  const response = await fetchServer(origin, healthUrl(origin));
  if (!response.ok) {
    throw new Error(`${origin} answered HTTP ${response.status} on /api/healthz`);
  }
}

async function hasSession(origin: string): Promise<boolean> {
  const response = await fetchServer(origin, "/api/auth/me");
  if (response.status === 200) return true;
  if (response.status === 401) return false;
  throw new Error(`${origin} answered HTTP ${response.status} on /api/auth/me`);
}

/** Loads the server when the window already has a session there, otherwise signs in via the browser. */
async function ensureSignedIn(origin: string): Promise<void> {
  serverOrigin = origin;
  try {
    if (await hasSession(origin)) {
      cancelSignIn();
      await loadServer(origin);
    } else {
      await beginSignIn(origin);
    }
  } catch (error) {
    log.error("could not reach the server", origin, error);
    await showConnect({ url: origin, error: `Could not reach ${origin}: ${describe(error)}` });
  }
}

async function beginSignIn(origin: string): Promise<void> {
  cancelSignIn();
  const secret = createSignInChallenge();
  pendingSignIn = {
    origin,
    secret,
    startedAt: Date.now(),
    timer: setInterval(() => void pollSignIn(), SIGN_IN_POLL_MS),
    polling: false,
  };
  log.info("sign-in started in the browser", { origin, challenge: secret.challenge });
  openExternal(signInUrl(origin, secret.challenge, app.isPackaged));
  await showWaiting(origin);
}

function cancelSignIn(): void {
  if (pendingSignIn) clearInterval(pendingSignIn.timer);
  pendingSignIn = null;
}

async function pollSignIn(): Promise<void> {
  const pending = pendingSignIn;
  if (!pending || pending.polling) return;
  if (Date.now() - pending.startedAt > SIGN_IN_TIMEOUT_MS) {
    cancelSignIn();
    log.warn("sign-in timed out", pending.origin);
    await showConnect({ url: pending.origin, error: "Signing in took too long. Connect again to retry." });
    return;
  }
  pending.polling = true;
  try {
    const response = await fetchServer(pending.origin, "/api/auth/desktop/exchange", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ verifier: pending.secret.verifier }),
    });
    if (response.status === 202) return; // the browser has not approved yet
    if (!response.ok) throw new Error(`HTTP ${response.status} on /api/auth/desktop/exchange`);
    if (pendingSignIn !== pending) return; // cancelled while the request was in flight
    cancelSignIn();
    log.info("signed in through the browser", pending.origin);
    // Chromium writes cookie changes to disk lazily. Quitting (or Ctrl-C in development) soon
    // after signing in would otherwise lose the session and restart the browser flow next launch.
    await session.defaultSession.cookies.flushStore();
    await loadServer(pending.origin);
    mainWindow?.show();
    mainWindow?.focus();
  } catch (error) {
    // Transient while the person is busy in the browser; the timeout above ends it loudly.
    log.warn("sign-in poll failed", pending.origin, describe(error));
  } finally {
    pending.polling = false;
  }
}

/**
 * Opens a page of the connected server: now, or once the server is loaded and signed in. A deep
 * link that launched the app arrives before the window exists and waits here for `start()`.
 */
function openOnServer(path: string): void {
  pendingPath = path;
  mainWindow?.show();
  mainWindow?.focus();
  if (serverOrigin !== null && pendingSignIn === null && mainWindow !== null) {
    void loadServer(serverOrigin);
  }
}

function handleDeepLink(url: string): void {
  const challenge = parseSignedInDeepLink(url);
  if (challenge) {
    if (pendingSignIn?.secret.challenge !== challenge) {
      log.warn("deep link does not match the pending sign-in");
      return;
    }
    log.info("browser signalled sign-in completion");
    mainWindow?.show();
    mainWindow?.focus();
    void pollSignIn();
    return;
  }
  const path = parseOpenDeepLink(url);
  if (!path) {
    log.warn("ignored deep link", url);
    return;
  }
  log.info("deep link opens", path);
  openOnServer(path);
}

/** The server's own sign-in pages never render in the shell; the browser flow replaces them. */
function interceptAuthPage(url: string): boolean {
  if (serverOrigin === null || !isAuthPage(url, serverOrigin)) return false;
  log.info("server asked for sign-in; switching to the browser flow");
  // The page the server was heading for comes back once the browser flow is done.
  pendingPath = authPageNext(url) ?? pendingPath;
  void beginSignIn(serverOrigin);
  return true;
}

// ---------------------------------------------------------------- menus

function menuItem(entry: WorkspaceMenuEntry): Electron.MenuItemConstructorOptions {
  if (entry.separator) return { type: "separator" };
  const options: Electron.MenuItemConstructorOptions = {
    label: entry.label,
    enabled: entry.enabled ?? true,
    accelerator: entry.accelerator,
  };
  if (entry.checked !== undefined) {
    options.type = "radio";
    options.checked = entry.checked;
  }
  if (entry.path !== undefined) {
    const path = entry.path;
    options.click = () => openOnServer(path);
  } else if (entry.action === "switch-server") {
    options.click = () => {
      cancelSignIn();
      void showConnect({ url: serverOrigin ?? undefined });
    };
  }
  return options;
}

/** The application menu: the platform's standard menus plus Workspace, rebuilt whenever the list changes. */
function applyMenus(): void {
  const connected = serverOrigin !== null;
  const template: Electron.MenuItemConstructorOptions[] = [
    ...(process.platform === "darwin" ? [{ role: "appMenu" } as const] : []),
    { role: "editMenu" },
    { label: "Workspace", submenu: workspaceMenuEntries(workspaces, connected).map(menuItem) },
    { role: "viewMenu" },
    { role: "windowMenu" },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
  if (process.platform === "darwin") {
    app.dock?.setMenu(Menu.buildFromTemplate(dockMenuEntries(workspaces, connected).map(menuItem)));
  }
}

function setWorkspaces(update: DesktopWorkspaceUpdate | null): void {
  workspaces = update;
  applyMenus();
}

/** The web client's update, checked field by field: it is data from a page, not trusted structure. */
function parseWorkspaceUpdate(input: unknown): DesktopWorkspaceUpdate | null {
  if (typeof input !== "object" || input === null) return null;
  const { workspaces: list, current } = input as { workspaces?: unknown; current?: unknown };
  if (!Array.isArray(list) || list.length > MAX_WORKSPACES) return null;
  if (current !== null && (typeof current !== "string" || !WORKSPACE_SLUG.test(current))) return null;
  const parsed: DesktopWorkspace[] = [];
  for (const item of list) {
    if (typeof item !== "object" || item === null) return null;
    const { slug, name, role } = item as { slug?: unknown; name?: unknown; role?: unknown };
    if (typeof slug !== "string" || !WORKSPACE_SLUG.test(slug)) return null;
    if (typeof name !== "string" || name.length === 0 || name.length > 120) return null;
    if (typeof role !== "string" || !WORKSPACE_ROLES.has(role)) return null;
    parsed.push({ slug, name, role: role as DesktopWorkspace["role"] });
  }
  return { workspaces: parsed, current: current as string | null };
}

// ---------------------------------------------------------------- window

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

  const guardNavigation = (event: Electron.Event, url: string): void => {
    if (interceptAuthPage(url)) {
      event.preventDefault();
      return;
    }
    if (isAllowedNavigation(url)) return;
    event.preventDefault();
    openExternal(url);
  };
  window.webContents.on("will-navigate", guardNavigation);
  window.webContents.on("will-redirect", guardNavigation);
  window.webContents.on("did-navigate-in-page", (_event, url) => {
    interceptAuthPage(url);
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

function fromConnectPage(event: Electron.IpcMainInvokeEvent): boolean {
  const sender = event.senderFrame?.url ?? "";
  if (isConnectPage(sender)) return true;
  log.warn("IPC rejected, sender is not the connect screen", sender);
  return false;
}

ipcMain.handle(CONNECT_CHANNEL, async (event, input: unknown): Promise<ConnectResult> => {
  if (!fromConnectPage(event)) {
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
  if (origin !== serverOrigin) pendingPath = null; // a page of another server means nothing here
  await ensureSignedIn(origin);
  return { ok: true };
});

ipcMain.handle(SIGN_IN_REOPEN_CHANNEL, (event): ConnectResult => {
  if (!fromConnectPage(event)) {
    return { ok: false, error: "Only the connect screen may reopen the sign-in." };
  }
  if (!pendingSignIn) {
    return { ok: false, error: "No sign-in is in progress. Connect again." };
  }
  openExternal(signInUrl(pendingSignIn.origin, pendingSignIn.secret.challenge, app.isPackaged));
  return { ok: true };
});

ipcMain.handle(SIGN_IN_CANCEL_CHANNEL, async (event): Promise<void> => {
  if (!fromConnectPage(event)) return;
  const origin = pendingSignIn?.origin ?? serverOrigin ?? undefined;
  cancelSignIn();
  await showConnect({ url: origin });
});

ipcMain.on(WORKSPACES_CHANNEL, (event, input: unknown) => {
  const sender = event.senderFrame?.url ?? "";
  if (serverOrigin === null || !isOnServer(sender, serverOrigin)) {
    log.warn("workspace update rejected, sender is not the server", sender);
    return;
  }
  const update = parseWorkspaceUpdate(input);
  if (!update) {
    log.warn("workspace update rejected, malformed payload");
    return;
  }
  log.debug("workspace menu", { workspaces: update.workspaces.length, current: update.current });
  setWorkspaces(update);
});

async function start(): Promise<void> {
  const { settings, problem } = readSettings();
  const target = process.env.STUDIO_SERVER_URL ?? settings.serverUrl;
  if (!target) {
    await showConnect({ error: problem });
    return;
  }
  let origin: string;
  try {
    origin = normalizeServerUrl(target);
  } catch (error) {
    log.error("saved server address is unusable", target, error);
    await showConnect({ url: target, error: describe(error) });
    return;
  }
  await ensureSignedIn(origin);
}

// Deep links: `beancount-studio://signed-in?…` brings the window back once the browser is done,
// `beancount-studio://w/<workspace>/…` opens that page of the connected server. macOS only
// delivers them to a packaged app whose Info.plist declares the scheme (electron-builder.yml,
// `protocols`); in development the sign-in relies on polling alone.
if (app.isPackaged) {
  app.setAsDefaultProtocolClient(DEEP_LINK_SCHEME);
}
app.on("open-url", (event, url) => {
  event.preventDefault();
  handleDeepLink(url);
});

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
    applyMenus();
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
