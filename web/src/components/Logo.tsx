import Image from "next/image";
import Link from "next/link";
import { cn } from "@/lib/cn";

/** ChadWallet logo mark + optional wordmark. */
export function Logo({
  size = 32,
  withWordmark = true,
  href = "/",
  variant = "dark",
  className,
}: {
  size?: number;
  withWordmark?: boolean;
  href?: string | null;
  variant?: "dark" | "light";
  className?: string;
}) {
  // logo-dark.png = white mark on black (for dark backgrounds)
  // logo-light.png = black mark on white (for light backgrounds)
  const src = variant === "dark" ? "/brand/logo-dark.png" : "/brand/logo-light.png";
  const wordColor = variant === "dark" ? "text-white" : "text-ink";

  const inner = (
    <span className={cn("inline-flex items-center gap-2", className)}>
      <Image
        src={src}
        alt="ChadWallet"
        width={size}
        height={size}
        className="rounded-md"
        priority
      />
      {withWordmark && (
        <span
          className={cn(
            "font-display font-bold tracking-tight",
            wordColor
          )}
          style={{ fontSize: size * 0.62 }}
        >
          ChadWallet
        </span>
      )}
    </span>
  );

  if (href === null) return inner;
  return (
    <Link href={href} aria-label="ChadWallet home" className="shrink-0">
      {inner}
    </Link>
  );
}
