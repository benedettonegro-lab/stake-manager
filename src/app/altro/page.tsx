import { AppCard } from "@/components/app";
import { AppShell } from "@/components/app-shell";

const links = [
  { href: "/bookmakers", label: "Bookmakers", hint: "Elenco quote" },
  { href: "/movimenti", label: "Movimenti", hint: "Report" },
  { href: "/transactions", label: "Registra", hint: "Deposito / prelievo" },
  { href: "/scommesse/nuova", label: "Nuova giocata", hint: "Form breve" },
  { href: "/login", label: "Account", hint: "Accesso" },
] as const;

export default function AltroPage() {
  return (
    <AppShell title="Altro">
      <ul className="flex flex-col gap-2 p-0">
        {links.map((item) => (
          <li key={item.href}>
            <AppCard href={item.href} padding="sm" className="!rounded-xl">
              <p className="text-sm font-semibold text-white">{item.label}</p>
              <p className="mt-0.5 text-[10px] text-[#64748b]">{item.hint}</p>
            </AppCard>
          </li>
        ))}
      </ul>
    </AppShell>
  );
}
