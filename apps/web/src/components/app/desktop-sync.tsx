"use client";

import { useEffect } from "react";
import { useCurrentWorkspace } from "@/components/workspace/use-current-workspace";
import { useMe } from "@/lib/api/hooks";
import { desktopBridge } from "@/lib/desktop";

/**
 * Keeps the desktop shell's Workspace menu in step with the person's workspaces and the one on
 * screen. Renders nothing and does nothing in a browser.
 */
export function DesktopSync() {
  const { data: me } = useMe();
  const { slug, workspaces } = useCurrentWorkspace();
  const list = workspaces.data;

  useEffect(() => {
    const bridge = desktopBridge();
    if (!bridge?.setWorkspaces) return;
    if (me === undefined) return; // not known yet
    if (me !== null && !list) return; // signed in, list still loading: the shell keeps its menu as it is
    const items = me ? (list ?? []) : [];
    bridge.setWorkspaces({
      workspaces: items.map((item) => ({ slug: item.slug, name: item.name, role: item.role })),
      current: items.some((item) => item.slug === slug) ? slug : null,
    });
  }, [me, list, slug]);

  return null;
}
