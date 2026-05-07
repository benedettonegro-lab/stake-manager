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
    "border-transparent bg-gradient-to-r from-[#3d4558] to-[#5c4d7a] text-white shadow-md shadow-black/25",
  secondary:
    "border-white/[0.08] bg-[#121B2F] text-[#E6EAF2] hover:border-white/[0.14]",
  ghost: "border-white/[0.08] bg-transparent text-[#94a3b8] hover:border-white/[0.14] hover:text-[#E6EAF2]",
  danger: "border-[#fb7185]/40 bg-[#fb7185]/10 text-[#fda4af] hover:bg-[#fb7185]/20",
} as const;

const base =
  "inline-flex min-h-[46px] items-center justify-center rounded-full border px-5 py-2.5 text-[16px] font-semibold transition duration-150 active:scale-[0.98] disabled:pointer-events-none disabled:opacity-45 sm:min-h-10 sm:px-4 sm:py-2 sm:text-sm";

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
