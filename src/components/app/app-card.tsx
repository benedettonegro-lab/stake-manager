"use client";

import Link from "next/link";
import type { ReactNode } from "react";

type AppCardProps = {
  children: ReactNode;
  className?: string;
  /** Se impostato, la card è un link (tap intera area) */
  href?: string;
  onClick?: () => void;
  padding?: "sm" | "md";
};

const pad = { sm: "p-3", md: "p-3.5" } as const;

const baseClass =
  "block w-full min-w-0 rounded-2xl border border-[#1e293b] bg-[#111827]/95 text-left shadow-sm shadow-black/20 transition duration-200 active:scale-[0.99] hover:border-[#334155] hover:bg-[#141c2e]";

export function AppCard({
  children,
  className = "",
  href,
  onClick,
  padding = "md",
}: AppCardProps) {
  const cls = `${baseClass} ${pad[padding]} ${className}`.trim();

  if (href) {
    return (
      <Link href={href} className={cls}>
        {children}
      </Link>
    );
  }

  if (onClick) {
    return (
      <button type="button" onClick={onClick} className={cls}>
        {children}
      </button>
    );
  }

  return <div className={cls}>{children}</div>;
}
