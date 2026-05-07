import { AppShell } from "@/components/app-shell";
import Link from "next/link";

export default function ScommessePage() {
  return (
    <AppShell>
      <div className="w-full space-y-6">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">
            Scommesse
          </h1>
          <p className="mt-2 text-lg sm:text-base sm:text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">
            Ogni scommessa collega un <strong className="font-medium">conto gioco</strong>{" "}
            (tuo o di un familiare) e un <strong className="font-medium">player</strong>{" "}
            (persona per cui vale la giocata). Stato{" "}
            <span className="font-mono text-sm sm:text-xs">won</span>,{" "}
            <span className="font-mono text-sm sm:text-xs">lost</span>,{" "}
            <span className="font-mono text-sm sm:text-xs">void</span> o{" "}
            <span className="font-mono text-sm sm:text-xs">cashout</span>: il profit viene
            calcolato e applicato al saldo del conto e al saldo del player.
          </p>
        </div>
        <Link
          href="/scommesse/nuova"
          className="inline-flex min-h-12 items-center justify-center rounded-xl bg-emerald-600 px-5 text-lg sm:text-base font-semibold text-white hover:bg-emerald-500 active:opacity-95 dark:bg-emerald-500 dark:hover:bg-emerald-400"
        >
          Nuova scommessa
        </Link>
      </div>
    </AppShell>
  );
}
