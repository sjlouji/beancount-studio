"use client";

import { useSyncExternalStore } from "react";
import type { WorkspaceRole } from "@/lib/api/types";

/**
 * The desktop shell's bridge, as its preload exposes it on `window.studioDesktop`. This mirrors
 * packages/desktop-bridge/src/index.ts: the web image is built from apps/web alone and cannot
 * depend on that package, so change both files together.
 */
export interface DesktopWorkspaceUpdate {
  readonly workspaces: ReadonlyArray<{ readonly slug: string; readonly name: string; readonly role: WorkspaceRole }>;
  /** Slug of the workspace on screen, or null outside any workspace. */
  readonly current: string | null;
}

export interface StudioDesktopBridge {
  readonly version: string;
  readonly platform: "darwin" | "win32" | "linux";
  /** Feeds the shell's Workspace menu and dock menu; shells older than this contract lack it. */
  readonly setWorkspaces?: (update: DesktopWorkspaceUpdate) => void;
}

declare global {
  interface Window {
    /** Present only when the web client runs inside the desktop shell. */
    readonly studioDesktop?: StudioDesktopBridge;
  }
}

/** The app's URL scheme: `beancount-studio://w/ada/books` opens that page in the shell. */
const DEEP_LINK_SCHEME = "beancount-studio";

export function desktopBridge(): StudioDesktopBridge | undefined {
  return typeof window === "undefined" ? undefined : window.studioDesktop;
}

/** A link that opens a page of this server in the desktop app, for people who reach it from outside the app. */
export function appLink(path: string): string {
  return `${DEEP_LINK_SCHEME}:/${path}`;
}

const noopSubscribe = () => () => {};

/** "desktop" inside the shell, "browser" in a browser, "unknown" until the client has rendered. */
export function useHost(): "desktop" | "browser" | "unknown" {
  return useSyncExternalStore(
    noopSubscribe,
    () => (window.studioDesktop ? "desktop" : "browser"),
    () => "unknown",
  );
}
