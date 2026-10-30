"use client";

import { useParams } from "next/navigation";
import { useEffect } from "react";
import { useMe, useWorkspaces } from "@/lib/api/hooks";
import type { Workspace } from "@/lib/api/types";
import { rememberWorkspace, rememberedWorkspace } from "@/lib/routes";

/** The workspace to show when the URL names none: the one opened last here, else the first. */
export function pickWorkspace(list: Workspace[]): Workspace | undefined {
  const remembered = rememberedWorkspace();
  return list.find((item) => item.slug === remembered) ?? list[0];
}

/**
 * The workspace the person is in: the `/w/<workspace>` segment when the URL has one, otherwise
 * the one opened last (or their first). `workspace` stays undefined while the list loads and
 * when they are not a member of the one in the URL.
 */
export function useCurrentWorkspace() {
  const params = useParams<{ workspace?: string }>();
  const { data: me } = useMe();
  const workspaces = useWorkspaces(Boolean(me));
  const fromUrl = typeof params.workspace === "string" ? params.workspace : null;
  const list = workspaces.data;
  const workspace = list ? (fromUrl ? list.find((item) => item.slug === fromUrl) : pickWorkspace(list)) : undefined;
  const slug = fromUrl ?? workspace?.slug ?? "";

  useEffect(() => {
    if (fromUrl && list?.some((item) => item.slug === fromUrl)) rememberWorkspace(fromUrl);
  }, [fromUrl, list]);

  return { slug, workspace, workspaces, fromUrl };
}
