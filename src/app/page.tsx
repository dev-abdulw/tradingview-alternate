import { Suspense } from "react";
import { ShellSkeleton } from "@/features/shell/shell-skeleton";
import { Workspace } from "@/features/shell/workspace";

export default function Home() {
  return (
    <Suspense fallback={<ShellSkeleton />}>
      <Workspace />
    </Suspense>
  );
}
