/**
 * The Workspace menu, Slack style: one entry per workspace with ⌘1–⌘9, then what you can do with
 * the current one. Pure: returns plain descriptions that main.ts turns into Electron menu items,
 * so the shape is unit tested without Electron.
 */

import type { DesktopWorkspaceUpdate } from "@beancount-studio/desktop-bridge";

export interface WorkspaceMenuEntry {
  readonly label?: string;
  /** Server-relative page the entry opens. */
  readonly path?: string;
  readonly accelerator?: string;
  readonly checked?: boolean;
  readonly enabled?: boolean;
  readonly separator?: boolean;
  /** Shell actions that are not a page. */
  readonly action?: "switch-server";
}

const SHORTCUT_SLOTS = 9;

/** `connected` is whether a server is loaded; without one the workspace entries make no sense. */
export function workspaceMenuEntries(update: DesktopWorkspaceUpdate | null, connected: boolean): WorkspaceMenuEntry[] {
  const workspaces = connected ? (update?.workspaces ?? []) : [];
  const current = workspaces.find((item) => item.slug === update?.current) ?? null;
  const canAdminister = current !== null && (current.role === "owner" || current.role === "admin");
  const entries: WorkspaceMenuEntry[] = [];
  if (workspaces.length === 0) {
    entries.push({ label: connected ? "No Workspaces Yet" : "Not Connected", enabled: false });
  }
  workspaces.forEach((item, index) => {
    entries.push({
      label: item.name,
      path: `/w/${item.slug}`,
      accelerator: index < SHORTCUT_SLOTS ? `CmdOrCtrl+${index + 1}` : undefined,
      checked: item.slug === update?.current,
    });
  });
  entries.push({ separator: true });
  entries.push({ label: "Create a Workspace…", path: "/new", enabled: connected });
  entries.push({ label: "Workspace Settings…", path: current ? `/w/${current.slug}/settings` : undefined, enabled: current !== null });
  entries.push({ label: "Invite People…", path: current ? `/w/${current.slug}/settings#invites` : undefined, enabled: canAdminister });
  entries.push({ separator: true });
  entries.push({ label: "Switch Server…", action: "switch-server" });
  return entries;
}

/** The dock menu lists the workspaces only, as Slack's does. */
export function dockMenuEntries(update: DesktopWorkspaceUpdate | null, connected: boolean): WorkspaceMenuEntry[] {
  return workspaceMenuEntries(update, connected).filter((entry) => entry.path !== undefined && entry.path.startsWith("/w/") && !entry.path.includes("/settings"));
}
