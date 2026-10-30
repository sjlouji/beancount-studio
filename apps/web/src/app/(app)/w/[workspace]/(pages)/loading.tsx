import { PageSkeleton } from "@/components/app/states";

/** Shown inside the frame while a workspace page's code and data load. */
export default function WorkspaceLoading() {
  return <PageSkeleton cards={3} />;
}
