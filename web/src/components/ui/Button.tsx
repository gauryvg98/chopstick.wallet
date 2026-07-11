import { cn } from "@/lib/cn";

type Variant = "primary" | "sell" | "dark" | "ghost" | "white" | "outline";
type Size = "sm" | "md" | "lg";

const base =
  "inline-flex items-center justify-center gap-2 rounded-full font-semibold transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-solis/60 disabled:opacity-50 disabled:pointer-events-none select-none";

const variants: Record<Variant, string> = {
  primary: "bg-solis text-ink hover:bg-solis-dark",
  sell: "bg-down text-white hover:brightness-110",
  dark: "bg-surface-2 text-white hover:bg-line border border-line-2",
  ghost: "bg-transparent text-white hover:bg-white/5",
  white: "bg-white text-ink hover:bg-white/90",
  outline: "bg-transparent text-white border border-line-2 hover:border-white/40",
};

const sizes: Record<Size, string> = {
  sm: "h-9 px-4 text-sm",
  md: "h-11 px-5 text-sm",
  lg: "h-14 px-7 text-base",
};

export function Button({
  variant = "primary",
  size = "md",
  className,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant;
  size?: Size;
}) {
  return (
    <button
      className={cn(base, variants[variant], sizes[size], className)}
      {...props}
    />
  );
}
