"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";

/**
 * State for the trade left panel:
 *  - DESKTOP: `collapsed` folds the panel away and the grid resizes to fill it
 *    (persisted so it survives reloads).
 *  - MOBILE: `mobileOpen` slides the same panel in as an overlay drawer; closed
 *    by default so the trade page is the full focus.
 */
const Ctx = createContext<{
  collapsed: boolean;
  toggle: () => void;
  mobileOpen: boolean;
  openMobile: () => void;
  closeMobile: () => void;
  toggleMobile: () => void;
}>({
  collapsed: false,
  toggle: () => {},
  mobileOpen: false,
  openMobile: () => {},
  closeMobile: () => {},
  toggleMobile: () => {},
});

const KEY = "chad.sidebarCollapsed";

export function SidebarProvider({ children }: { children: React.ReactNode }) {
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  // Read the persisted choice after mount (avoids a hydration mismatch).
  useEffect(() => {
    try {
      setCollapsed(localStorage.getItem(KEY) === "1");
    } catch {
      /* storage unavailable */
    }
  }, []);
  const toggle = useCallback(() => {
    setCollapsed((c) => {
      const next = !c;
      try {
        localStorage.setItem(KEY, next ? "1" : "0");
      } catch {
        /* storage unavailable */
      }
      return next;
    });
  }, []);
  const openMobile = useCallback(() => setMobileOpen(true), []);
  const closeMobile = useCallback(() => setMobileOpen(false), []);
  const toggleMobile = useCallback(() => setMobileOpen((o) => !o), []);
  return (
    <Ctx.Provider
      value={{ collapsed, toggle, mobileOpen, openMobile, closeMobile, toggleMobile }}
    >
      {children}
    </Ctx.Provider>
  );
}

export const useSidebar = () => useContext(Ctx);
