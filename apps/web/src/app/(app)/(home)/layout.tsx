import { WorkspaceFrame } from "@/components/workspace/workspace-frame";

/** Account pages (settings, profiles) share the frame with the workspace pages. */
export default function HomeLayout({ children }: { children: React.ReactNode }) {
  return <WorkspaceFrame>{children}</WorkspaceFrame>;
}
