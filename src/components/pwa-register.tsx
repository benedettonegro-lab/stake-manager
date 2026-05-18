"use client";

import { useEffect, useState } from "react";

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

export function PwaRegister() {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined" || !("serviceWorker" in navigator)) return;

    const register = async () => {
      try {
        await navigator.serviceWorker.register("/sw.js", { scope: "/" });
      } catch {
        /* dev / unsupported */
      }
    };
    void register();

    const onBip = (e: Event) => {
      e.preventDefault();
      setDeferred(e as BeforeInstallPromptEvent);
    };
    window.addEventListener("beforeinstallprompt", onBip);
    return () => window.removeEventListener("beforeinstallprompt", onBip);
  }, []);

  if (!deferred || dismissed) return null;

  return (
    <div className="fixed bottom-[calc(4.75rem+env(safe-area-inset-bottom))] left-0 right-0 z-[60] px-3 sm-app-constrain">
      <div className="flex items-center gap-3 rounded-2xl border border-[#A970FF]/25 bg-[#12192A]/98 px-3 py-3 shadow-lg backdrop-blur-md">
        <p className="min-w-0 flex-1 text-xs leading-snug text-[#E6EAF2]">
          Installa <strong>Stake Manager</strong> per un&apos;esperienza app nativa.
        </p>
        <button
          type="button"
          className="sm-touch shrink-0 rounded-xl bg-[#A970FF]/20 px-3 py-2 text-xs font-bold text-[#D4BCFF] transition active:scale-95"
          onClick={async () => {
            await deferred.prompt();
            setDeferred(null);
          }}
        >
          Installa
        </button>
        <button
          type="button"
          className="sm-touch shrink-0 rounded-lg px-2 py-2 text-xs text-[#8B93A7]"
          aria-label="Chiudi"
          onClick={() => setDismissed(true)}
        >
          ✕
        </button>
      </div>
    </div>
  );
}
