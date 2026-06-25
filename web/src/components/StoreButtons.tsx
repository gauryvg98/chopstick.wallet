import { cn } from "@/lib/cn";

export const APP_STORE_URL =
  "https://apps.apple.com/us/app/chadwallet/id6757367474";
export const PLAY_STORE_URL =
  "https://play.google.com/store/apps/details?id=xyz.chadwallet.www";

function Badge({
  href,
  label,
  sub,
  icon,
  className,
}: {
  href: string;
  label: string;
  sub: string;
  icon: React.ReactNode;
  className?: string;
}) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className={cn(
        "inline-flex items-center gap-3 h-14 px-5 rounded-2xl bg-white text-ink hover:bg-white/90 transition-colors",
        className
      )}
    >
      <span className="shrink-0">{icon}</span>
      <span className="flex flex-col leading-tight text-left">
        <span className="text-[11px] text-ink/60">{sub}</span>
        <span className="text-base font-bold -mt-0.5">{label}</span>
      </span>
    </a>
  );
}

export function StoreButtons({ className }: { className?: string }) {
  return (
    <div className={cn("flex flex-wrap gap-3", className)}>
      <Badge
        href={APP_STORE_URL}
        sub="Download on the"
        label="App Store"
        icon={
          <svg width="26" height="26" viewBox="0 0 24 24" fill="currentColor">
            <path d="M16.36 1.43c.02 1.06-.38 2.08-1.06 2.83-.7.78-1.84 1.38-2.94 1.29-.13-1.03.39-2.12 1.03-2.8.72-.78 1.96-1.36 2.97-1.32zM20.5 17.2c-.55 1.27-.82 1.84-1.53 2.96-.99 1.57-2.38 3.53-4.1 3.54-1.53.02-1.92-.99-4-.98-2.08.01-2.51 1-4.04.97-1.72-.02-3.04-1.78-4.03-3.35C-.07 16.6-.36 11.5 1.34 8.79c1.2-1.95 3.1-3.09 4.88-3.09 1.82 0 2.96 1 4.46 1 1.46 0 2.35-1 4.46-1 1.6 0 3.29.87 4.5 2.37-3.95 2.17-3.31 7.82.36 9.13z" />
          </svg>
        }
      />
      <Badge
        href={PLAY_STORE_URL}
        sub="Get it on"
        label="Google Play"
        icon={
          <svg width="24" height="24" viewBox="0 0 512 512">
            <path d="M48 59.49v393a4.33 4.33 0 0 0 7.37 3.07L260 256 55.37 56.42A4.33 4.33 0 0 0 48 59.49z" fill="#34d399" />
            <path d="M345.8 174 89.22 25.96l-.13-.08c-4.64-2.65-9.13 3.64-5.38 7.4L260 256z" fill="#60a5fa" />
            <path d="M83.71 478.72c-3.75 3.76.74 10.05 5.38 7.4l.13-.08L345.8 338 260 256z" fill="#f87171" />
            <path d="M449.38 231.81 374.32 189l-90.62 67 90.62 67 75.06-42.81a26 26 0 0 0 0-46.38z" fill="#fbbf24" />
          </svg>
        }
      />
    </div>
  );
}
