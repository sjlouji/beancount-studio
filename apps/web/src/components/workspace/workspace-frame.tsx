"use client";

import { HouseIcon, MenuIcon, SettingsIcon } from "lucide-react";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { AppFrame } from "@/components/app/app-frame";
import { useFrameState } from "@/components/app/frame-state";
import { HomeSearch, useHomeSearch } from "@/components/app/home-search";
import { workspaceHref } from "@/lib/routes";
import { useCurrentWorkspace } from "./use-current-workspace";
import { WorkspaceSidebar } from "./workspace-sidebar";

/** The frame outside a ledger; workspace pages and account pages share it. */
export function WorkspaceFrame({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const search = useHomeSearch();
  const { setMobileSidebarOpen } = useFrameState();
  const { slug } = useCurrentWorkspace();
  const home = slug ? workspaceHref(slug) : "/";
  return (
    <AppFrame
      sidebar={<WorkspaceSidebar onSearch={search.open} />}
      searchLabel="Search Beancount Studio"
      onSearch={search.open}
      contentClassName="max-w-6xl"
      mobileTabs={[
        { label: "Home", icon: HouseIcon, href: home, active: pathname === home },
        { label: "Settings", icon: SettingsIcon, href: "/settings", active: pathname.startsWith("/settings") },
        { label: "Menu", icon: MenuIcon, onClick: () => setMobileSidebarOpen(true) },
      ]}
    >
      {children}
      <HomeSearch />
    </AppFrame>
  );
}
