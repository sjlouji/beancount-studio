import { WorkspaceFrame } from "@/components/workspace/workspace-frame";

/** Workspace home and settings share the frame with the account pages; ledger pages have their own shell. */
export default function WorkspacePagesLayout({ children }: { children: React.ReactNode }) {
  return <WorkspaceFrame>{children}</WorkspaceFrame>;
}
