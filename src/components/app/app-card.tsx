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

const pad = { sm: "p-2 sm:p-3", md: "px-2.5 py-2 sm:px-4 sm:py-4" } as const;

const baseClass =
  "block w-full min-w-0 rounded-2xl border border-white/[0.06] bg-[#11182B]/95 text-left shadow-sm shadow-black/15 transition duration-200 active:scale-[0.99] hover:border-white/[0.06] hover:bg-white/[0.04] sm:rounded-2xl sm:shadow-black/20";

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
