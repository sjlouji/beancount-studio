import { PageSkeleton } from "@/components/app/states";

/** Shown inside the frame while a home page's code and data load. */
export default function HomeLoading() {
  return <PageSkeleton cards={3} />;
}
