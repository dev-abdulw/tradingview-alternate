import type { Metadata } from "next";
import { Suspense } from "react";
import { Skeleton } from "@/ui/skeleton";
import { MarketDebug } from "./market-debug";

export const metadata: Metadata = { title: "Market data debug", robots: { index: false } };

export default function DebugPage() {
  return (
    <Suspense
      fallback={
        <div className="grid gap-3 p-6 md:grid-cols-4">
          {Array.from({ length: 4 }, (_, i) => (
            <Skeleton key={i} className="h-40" />
          ))}
        </div>
      }
    >
      <MarketDebug />
    </Suspense>
  );
}
