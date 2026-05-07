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
    "border-transparent bg-gradient-to-r from-[#3A4254] to-[#4F4A68] text-white shadow-sm shadow-black/20 sm:shadow-md sm:shadow-black/25",
  secondary:
    "border-white/[0.06] bg-[#131C31] text-[#E6EAF2] hover:border-white/[0.12]",
  ghost: "border-white/[0.06] bg-transparent text-[#8B93A7] hover:border-white/[0.12] hover:text-[#E6EAF2]",
  danger: "border-[#fb7185]/40 bg-[#fb7185]/10 text-[#fda4af] hover:bg-[#fb7185]/20",
} as const;

const base =
  "inline-flex min-h-[48px] items-center justify-center rounded-full border px-4 py-2 text-[16px] font-semibold transition duration-150 active:scale-[0.98] disabled:pointer-events-none disabled:opacity-45 sm:min-h-10 sm:px-4 sm:py-2 sm:text-sm";

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
