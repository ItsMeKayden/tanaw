import { OverviewSkeleton } from "@/components/ui/skeletons";

/** Shown while a workspace page's code loads; each page then shows its own skeleton. */
export default function WorkspaceLoading() {
  return <OverviewSkeleton label="page" />;
}
