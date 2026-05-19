"use client";

import { ErrorBoundary } from "@/components/error-boundary";
import { PwaRegister } from "@/components/pwa-register";
import { TabPrefetchTrigger } from "@/components/tab-prefetch-trigger";
import { useEffect, useState } from "react";

function NetworkRecoveryBanner() {
  const [offline, setOffline] = useState(false);

  useEffect(() => {
    const sync = () => setOffline(!navigator.onLine);
    sync();
    window.addEventListener("online", sync);
    window.addEventListener("offline", sync);
    return () => {
      window.removeEventListener("online", sync);
      window.removeEventListener("offline", sync);
    };
  }, []);

  if (!offline) return null;

  return (
    <div
      className="fixed left-0 right-0 top-0 z-[100] bg-amber-500/90 px-3 py-1.5 text-center text-xs font-semibold text-[#0B1224]"
      role="status"
    >
      Sei offline — i dati in cache restano disponibili
    </div>
  );
}

export function ClientProviders({ children }: { children: React.ReactNode }) {
  return (
    <ErrorBoundary>
      <NetworkRecoveryBanner />
      {children}
      <TabPrefetchTrigger />
      <PwaRegister />
    </ErrorBoundary>
  );
}
