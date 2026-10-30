import type { WorkspaceRole } from "@/lib/api/types";

/** Mirrors the API's rank order (apps/api/app/core/deps.py): only someone above a member may change them. */
export const ROLE_RANK: Record<WorkspaceRole, number> = { viewer: 1, member: 2, admin: 3, owner: 4 };

export const ROLE_LABELS: Record<WorkspaceRole, string> = { owner: "Owner", admin: "Admin", member: "Member", viewer: "Viewer" };

export const ROLE_OPTIONS: Array<{ value: WorkspaceRole; label: string; hint: string }> = [
  { value: "viewer", label: "Viewer", hint: "Reads every ledger" },
  { value: "member", label: "Member", hint: "Reads and writes every ledger" },
  { value: "admin", label: "Admin", hint: "Also manages ledgers, members and invites" },
  { value: "owner", label: "Owner", hint: "Everything, including deleting the workspace" },
];

export function canAdminister(role: WorkspaceRole | undefined): boolean {
  return role === "owner" || role === "admin";
}

export function canWrite(role: WorkspaceRole | undefined): boolean {
  return role !== undefined && role !== "viewer";
}

/** Mirrors the API's workspace slug rule (apps/api/app/schemas.py): 3–40 lowercase letters, digits or hyphens. */
export const WORKSPACE_SLUG_PATTERN = /^[a-z0-9](?:[a-z0-9-]{1,38}[a-z0-9])$/;

/** The address the API would derive from a name, so the form can show it before submitting. */
export function slugFromName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40)
    .replace(/-+$/g, "");
}
