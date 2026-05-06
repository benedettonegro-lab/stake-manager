import Link from "next/link";
import type { ReactNode } from "react";

type QuickActionButtonProps = {
  children: ReactNode;
  href?: string;
  onClick?: () => void;
  variant?: "primary" | "secondary" | "ghost" | "danger";
  type?: "button" | "submit";
  disabled?: boolean;
  className?: string;
  title?: string;
};

const variants = {
  primary:
    "border-transparent bg-gradient-to-r from-[#5b5cff] to-[#a855f7] text-white shadow-lg shadow-[#5b5cff]/25",
  secondary:
    "border-[#334155] bg-[#1e293b] text-[#e2e8f0] hover:border-[#475569]",
  ghost: "border-[#273449] bg-transparent text-[#94a3b8] hover:border-[#475569] hover:text-white",
  danger: "border-[#fb7185]/40 bg-[#fb7185]/10 text-[#fda4af] hover:bg-[#fb7185]/20",
} as const;

const base =
  "inline-flex min-h-10 items-center justify-center rounded-full border px-4 text-xs font-semibold transition duration-150 active:scale-[0.98] disabled:pointer-events-none disabled:opacity-45";

export function QuickActionButton({
  children,
  href,
  onClick,
  variant = "secondary",
  type = "button",
  disabled,
  className = "",
  title,
}: QuickActionButtonProps) {
  const cls = `${base} ${variants[variant]} ${className}`.trim();

  if (href) {
    return (
      <Link href={href} className={cls} title={title}>
        {children}
      </Link>
    );
  }

  return (
    <button type={type} onClick={onClick} disabled={disabled} className={cls} title={title}>
      {children}
    </button>
  );
}
