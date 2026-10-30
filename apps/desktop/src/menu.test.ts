import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { DesktopWorkspaceUpdate } from "@beancount-studio/desktop-bridge";

import { dockMenuEntries, workspaceMenuEntries } from "./menu";

const update: DesktopWorkspaceUpdate = {
  workspaces: [
    { slug: "lovelace", name: "Lovelace household", role: "owner" },
    { slug: "club", name: "Chess club", role: "viewer" },
  ],
  current: "club",
};

describe("workspaceMenuEntries", () => {
  it("lists the workspaces with ⌘1–⌘9 and marks the current one", () => {
    const entries = workspaceMenuEntries(update, true);
    const [first, second] = entries;
    assert.deepEqual(first, { label: "Lovelace household", path: "/w/lovelace", accelerator: "CmdOrCtrl+1", checked: false });
    assert.deepEqual(second, { label: "Chess club", path: "/w/club", accelerator: "CmdOrCtrl+2", checked: true });
  });

  it("offers settings for the current workspace and invites only to its admins", () => {
    const viewer = workspaceMenuEntries(update, true);
    assert.deepEqual(viewer.find((entry) => entry.label === "Workspace Settings…"), { label: "Workspace Settings…", path: "/w/club/settings", enabled: true });
    assert.deepEqual(viewer.find((entry) => entry.label === "Invite People…"), { label: "Invite People…", path: "/w/club/settings#invites", enabled: false });

    const owner = workspaceMenuEntries({ ...update, current: "lovelace" }, true);
    assert.equal(owner.find((entry) => entry.label === "Invite People…")?.enabled, true);
  });

  it("stops shortcuts after the ninth workspace", () => {
    const many = { workspaces: Array.from({ length: 11 }, (_, i) => ({ slug: `w${i}`, name: `W ${i}`, role: "member" as const })), current: null };
    const entries = workspaceMenuEntries(many, true);
    assert.equal(entries[8]?.accelerator, "CmdOrCtrl+9");
    assert.equal(entries[9]?.accelerator, undefined);
  });

  it("explains an empty list and keeps only the server action when not connected", () => {
    const empty = workspaceMenuEntries({ workspaces: [], current: null }, true);
    assert.deepEqual(empty[0], { label: "No Workspaces Yet", enabled: false });
    assert.equal(empty.find((entry) => entry.label === "Create a Workspace…")?.enabled, true);

    const offline = workspaceMenuEntries(update, false);
    assert.deepEqual(offline[0], { label: "Not Connected", enabled: false });
    assert.equal(offline.some((entry) => entry.path?.startsWith("/w/")), false);
    assert.equal(offline.find((entry) => entry.label === "Create a Workspace…")?.enabled, false);
    assert.deepEqual(offline[offline.length - 1], { label: "Switch Server…", action: "switch-server" });
  });
});

describe("dockMenuEntries", () => {
  it("keeps the workspaces only", () => {
    assert.deepEqual(
      dockMenuEntries(update, true).map((entry) => entry.path),
      ["/w/lovelace", "/w/club"],
    );
    assert.deepEqual(dockMenuEntries(update, false), []);
  });
});
