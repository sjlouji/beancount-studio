/**
 * Contract between the Beancount Studio web client and the desktop shell.
 *
 * The shell's preload script exposes this object as `window.studioDesktop` through Electron's
 * contextBridge. The web client treats its absence as "running in a browser". Keep the surface
 * small and serialisable: every member crosses the context-isolation boundary.
 */
export interface StudioDesktopBridge {
  /** Version of the shell (apps/desktop package.json). */
  readonly version: string;
  /** Host platform, for modifier keys and title-bar layout decisions. */
  readonly platform: "darwin" | "win32" | "linux";
}

declare global {
  interface Window {
    /** Present only when the web client runs inside the desktop shell. */
    readonly studioDesktop?: StudioDesktopBridge;
  }
}
