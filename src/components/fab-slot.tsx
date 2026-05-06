"use client";

import { AppFab } from "@/components/app/app-fab";
import { usePathname } from "next/navigation";

/** FAB “+” globale: nascosto su login. */
export function FabSlot() {
  const pathname = usePathname() ?? "";
  if (pathname.startsWith("/login")) return null;
  /** Pagina Bookmakers ha FAB dedicato. */
  if (pathname.startsWith("/bookmakers")) return null;
  return <AppFab href="/bets?nuova=1" label="Nuova giocata" />;
}
