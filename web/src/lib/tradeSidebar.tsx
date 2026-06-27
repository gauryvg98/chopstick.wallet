"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";

/**
 * Collapse state for the trade left panel — shared between the panel (which owns
 * the « / » toggle) and the grid wrapper (which resizes the workspace to fill
 * the freed space). Persisted so it survives reloads.
 */
const Ctx = createContext<{ collapsed: boolean; toggle: () => void }>({
  collapsed: false,
  toggle: () => {},
});

const KEY = "chad.sidebarCollapsed";

export function SidebarProvider({ children }: { children: React.ReactNode }) {
  const [collapsed, setCollapsed] = useState(false);
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
  return <Ctx.Provider value={{ collapsed, toggle }}>{children}</Ctx.Provider>;
}

export const useSidebar = () => useContext(Ctx);
