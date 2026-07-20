"use client";

import type React from "react";
import type { ButtonHTMLAttributes, ReactNode } from "react";

type Variant = "primary" | "secondary" | "success" | "warning" | "danger" | "ghost";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  icon?: ReactNode;
  children: ReactNode;
}

const VARIANT_CLASSES: Record<Variant, string> = {
  primary:
    "bg-sky-500 hover:bg-sky-400 text-white shadow-sm shadow-sky-500/20 focus-visible:ring-sky-400",
  secondary:
    "bg-slate-700 hover:bg-slate-600 text-slate-100 focus-visible:ring-slate-500",
  success:
    "bg-emerald-500 hover:bg-emerald-400 text-white shadow-sm shadow-emerald-500/20 focus-visible:ring-emerald-400",
  warning:
    "bg-amber-500 hover:bg-amber-400 text-slate-900 focus-visible:ring-amber-400",
  danger:
    "bg-rose-500 hover:bg-rose-400 text-white shadow-sm shadow-rose-500/20 focus-visible:ring-rose-400",
  ghost:
    "bg-transparent hover:bg-slate-800 text-slate-300 border border-slate-700 focus-visible:ring-slate-600",
};

export function Button({
  variant = "primary",
  icon,
  children,
  className = "",
  disabled,
  ...rest
}: ButtonProps): React.JSX.Element {
  return (
    <button
      className={`inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm font-medium
        transition-colors duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2
        focus-visible:ring-offset-slate-900 disabled:cursor-not-allowed disabled:opacity-40
        ${VARIANT_CLASSES[variant]} ${className}`}
      disabled={disabled}
      {...rest}
    >
      {icon}
      {children}
    </button>
  );
}
