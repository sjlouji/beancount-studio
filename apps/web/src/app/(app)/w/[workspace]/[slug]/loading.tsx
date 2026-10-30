import { PageSkeleton } from "@/components/app/states";

/** Shown inside the ledger frame while a ledger page's code and data load. */
export default function LedgerPageLoading() {
  return <PageSkeleton cards={3} />;
}
