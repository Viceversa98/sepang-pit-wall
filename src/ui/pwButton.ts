export type PwButtonSize = "sm" | "md" | "lg";
export type PwButtonVariant = "primary" | "secondary";

const sizeClasses: Record<PwButtonSize, string> = {
  sm: "px-2.5 py-1 text-xs",
  md: "px-4 py-2 text-sm",
  lg: "px-5 py-2.5 text-base",
};

const variantClasses: Record<PwButtonVariant, string> = {
  primary:
    "border border-amber-400/50 bg-amber-500/90 text-slate-950 hover:bg-amber-400 disabled:cursor-not-allowed disabled:opacity-45",
  secondary:
    "border border-white/15 bg-white/5 text-slate-200 hover:border-white/35 hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-45",
};

export const pwButtonClass = (
  variant: PwButtonVariant,
  size: PwButtonSize,
  options?: { fullWidth?: boolean; className?: string },
): string => {
  const { fullWidth = false, className = "" } = options ?? {};
  return [
    "rounded-sm font-mono tracking-wide transition",
    sizeClasses[size],
    variantClasses[variant],
    fullWidth ? "w-full" : "",
    className,
  ]
    .filter(Boolean)
    .join(" ");
};

export const pwSelectClass = (extra = ""): string =>
  [
    "pw-select w-full rounded-sm border border-white/15 bg-[var(--pw-panel-elevated)] px-2.5 py-2 font-mono text-xs text-slate-200 outline-none focus:border-amber-400/50",
    extra,
  ]
    .filter(Boolean)
    .join(" ");
