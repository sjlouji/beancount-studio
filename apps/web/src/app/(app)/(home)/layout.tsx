"use client";

import { HouseIcon, MenuIcon, SettingsIcon } from "lucide-react";
import { usePathname } from "next/navigation";
import { AppFrame } from "@/components/app/app-frame";
import { useFrameState } from "@/components/app/frame-state";
import { HomeSearch, useHomeSearch } from "@/components/app/home-search";
import { HomeSidebar } from "@/components/app/home-sidebar";

/** Home pages share the frame with the ledger pages; the sidebar lists the app's places and your ledgers. */
export default function HomeLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const search = useHomeSearch();
  const { setMobileSidebarOpen } = useFrameState();
  return (
    <AppFrame
      sidebar={<HomeSidebar onSearch={search.open} />}
      searchLabel="Search Beancount Studio"
      onSearch={search.open}
      contentClassName="max-w-6xl"
      mobileTabs={[
        { label: "Home", icon: HouseIcon, href: "/ledgers", active: pathname === "/ledgers" },
        { label: "Settings", icon: SettingsIcon, href: "/settings", active: pathname.startsWith("/settings") },
        { label: "Menu", icon: MenuIcon, onClick: () => setMobileSidebarOpen(true) },
      ]}
    >
      {children}
      <HomeSearch />
    </AppFrame>
  );
}
