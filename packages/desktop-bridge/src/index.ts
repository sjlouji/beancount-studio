/**
 * Contract between the Beancount Studio web client and the desktop shell.
 *
 * The shell's preload script exposes this object as `window.studioDesktop` through Electron's
 * contextBridge. The web client treats its absence as "running in a browser". Keep the surface
 * small and serialisable: every member crosses the context-isolation boundary.
 *
 * The web image is built from apps/web alone and cannot depend on this package, so
 * apps/web/src/lib/desktop.ts mirrors these types; change both together.
 */
export interface DesktopWorkspace {
  readonly slug: string;
  readonly name: string;
  readonly role: "owner" | "admin" | "member" | "viewer";
}

/** What the web client tells the shell whenever the person's workspaces or the current one change. */
export interface DesktopWorkspaceUpdate {
  readonly workspaces: readonly DesktopWorkspace[];
  /** Slug of the workspace on screen, or null outside any workspace (account pages, onboarding). */
  readonly current: string | null;
}

export interface StudioDesktopBridge {
  /** Version of the shell (apps/desktop package.json). */
  readonly version: string;
  /** Host platform, for modifier keys and title-bar layout decisions. */
  readonly platform: "darwin" | "win32" | "linux";
  /** Feeds the shell's Workspace menu (⌘1–⌘9) and dock menu. Shells older than this contract lack it. */
  readonly setWorkspaces?: (update: DesktopWorkspaceUpdate) => void;
}

declare global {
  interface Window {
    /** Present only when the web client runs inside the desktop shell. */
    readonly studioDesktop?: StudioDesktopBridge;
  }
}
