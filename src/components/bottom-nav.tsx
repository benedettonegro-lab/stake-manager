"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const items = [
  { href: "/dashboard", label: "Home", match: ["/", "/dashboard"] },
  { href: "/identities", label: "ID", match: ["/identities"] },
  { href: "/accounts", label: "Conti", match: ["/accounts", "/conti"] },
  { href: "/stakers", label: "Staker", match: ["/stakers"] },
  { href: "/bets", label: "Giocate", match: ["/bets", "/giocate", "/scommesse"] },
  { href: "/altro", label: "Altro", match: ["/altro", "/bookmakers", "/movimenti", "/transactions", "/players", "/clienti"] },
] as const;

function IconHome({ active }: { active: boolean }) {
  const c = active ? "#A970FF" : "#8B93A7";
  return (
    <svg
      className="h-[18px] w-[18px] shrink-0 sm:h-[22px] sm:w-[22px]"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden
    >
      <path
        d="M3 10.5L12 3l9 7.5V21a1 1 0 01-1 1h-5v-6H9v6H4a1 1 0 01-1-1v-10.5z"
        stroke={c}
        strokeWidth="1.75"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function IconUsers({ active }: { active: boolean }) {
  const c = active ? "#A970FF" : "#8B93A7";
  return (
    <svg
      className="h-[18px] w-[18px] shrink-0 sm:h-[22px] sm:w-[22px]"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden
    >
      <path
        d="M16 21v-2a4 4 0 00-4-4H6a4 4 0 00-4 4v2M9 11a4 4 0 100-8 4 4 0 000 8zM22 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75"
        stroke={c}
        strokeWidth="1.75"
        strokeLinecap="round"
      />
    </svg>
  );
}

function IconWallet({ active }: { active: boolean }) {
  const c = active ? "#A970FF" : "#8B93A7";
  return (
    <svg
      className="h-[18px] w-[18px] shrink-0 sm:h-[22px] sm:w-[22px]"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden
    >
      <path
        d="M19 7V5a2 2 0 00-2-2H5a2 2 0 00-2 2v14a2 2 0 002 2h12a2 2 0 002-2v-2M19 7h-4a2 2 0 00-2 2v4a2 2 0 002 2h4M19 7V9a2 2 0 012 2v0a2 2 0 01-2 2"
        stroke={c}
        strokeWidth="1.75"
        strokeLinecap="round"
      />
    </svg>
  );
}

function IconTicket({ active }: { active: boolean }) {
  const c = active ? "#A970FF" : "#8B93A7";
  return (
    <svg
      className="h-[18px] w-[18px] shrink-0 sm:h-[22px] sm:w-[22px]"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden
    >
      <path
        d="M3 7h3l2-3h8l2 3h3v10h-3l-2 3H8l-2-3H3V7z"
        stroke={c}
        strokeWidth="1.75"
        strokeLinejoin="round"
      />
      <path d="M12 8v8" stroke={c} strokeWidth="1.75" strokeLinecap="round" />
    </svg>
  );
}

function IconStaker({ active }: { active: boolean }) {
  const c = active ? "#A970FF" : "#8B93A7";
  return (
    <svg
      className="h-[18px] w-[18px] shrink-0 sm:h-[22px] sm:w-[22px]"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden
    >
      <path
        d="M12 2l2.4 7.4h7.6l-6 4.6 2.3 7-6.3-4.5-6.3 4.5 2.3-7-6-4.6h7.6L12 2z"
        stroke={c}
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function IconMore({ active }: { active: boolean }) {
  const c = active ? "#A970FF" : "#8B93A7";
  return (
    <svg
      className="h-[18px] w-[18px] shrink-0 sm:h-[22px] sm:w-[22px]"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden
    >
      <circle cx="6" cy="12" r="1.75" fill={c} />
      <circle cx="12" cy="12" r="1.75" fill={c} />
      <circle cx="18" cy="12" r="1.75" fill={c} />
    </svg>
  );
}

const icons = [IconHome, IconUsers, IconWallet, IconStaker, IconTicket, IconMore] as const;

export function BottomNav() {
  const pathname = usePathname();

  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-50 max-h-[72px] border-t border-white/[0.06] bg-[#0A1020]/96 pb-[max(0.25rem,env(safe-area-inset-bottom))] pt-0.5 backdrop-blur-md sm:max-h-none sm:pb-[max(0.35rem,env(safe-area-inset-bottom))] sm:pt-1"
      aria-label="Navigazione principale"
    >
      <div className="sm-app-constrain grid max-h-[72px] min-h-0 grid-cols-6 items-stretch px-0.5 sm:max-h-none sm:min-h-[50px] sm:px-0.5">
        {items.map((item, i) => {
          const Icon = icons[i];
          const active = item.match.some(
            (m) => pathname === m || pathname.startsWith(`${m}/`),
          );
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex min-h-[40px] min-w-0 max-h-full flex-col items-center justify-center gap-0 rounded-md py-0 transition duration-150 active:scale-95 sm:min-h-[48px] sm:gap-0.5 sm:rounded-xl sm:py-1 ${
                active ? "text-[#B89EFF]" : "text-[#8B93A7] hover:text-[#B4BCCC]"
              }`}
            >
              <Icon active={active} />
              <span className="max-w-full truncate px-0.5 text-[10px] font-semibold uppercase leading-tight tracking-[0.1em] sm:text-xs sm:tracking-[0.15em]">
                {item.label}
              </span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
