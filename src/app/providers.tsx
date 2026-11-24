"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState, type ReactNode } from "react";
import { useAppearanceSync, useResolvedTheme } from "@/features/settings/use-appearance";
import { Toaster } from "@/ui/toast";
import { TooltipProvider } from "@/ui/tooltip";

function AppearanceSync() {
  useAppearanceSync();
  return null;
}

function ThemedToaster() {
  return <Toaster theme={useResolvedTheme()} />;
}

export function Providers({ children }: { children: ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: { staleTime: 30_000, refetchOnWindowFocus: false, retry: 2 },
        },
      }),
  );
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <AppearanceSync />
        {children}
        <ThemedToaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}
