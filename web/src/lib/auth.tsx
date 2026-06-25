"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { PrivyProvider, usePrivy } from "@privy-io/react-auth";
import { useWallets as useSolanaWallets } from "@privy-io/react-auth/solana";
import { createSolanaRpc, createSolanaRpcSubscriptions } from "@solana/kit";

// Privy's embedded-wallet signing needs a Solana RPC per chain (it reads
// blockhash / validates the tx). The public mainnet RPC 403s browser requests, so
// we route through our backend's /api/rpc proxy (relays to Helius, key stays
// server-side). Override with NEXT_PUBLIC_SOLANA_RPC if you have a dedicated
// browser-safe endpoint. The wss is only used by send-and-subscribe flows (we
// broadcast via the backend instead), so a public placeholder is fine.
const API_BASE = (process.env.NEXT_PUBLIC_API_BASE ?? "").replace(/\/$/, "");
const SOLANA_RPC =
  process.env.NEXT_PUBLIC_SOLANA_RPC ?? `${API_BASE}/api/rpc`;
const SOLANA_WSS =
  process.env.NEXT_PUBLIC_SOLANA_WSS ?? "wss://api.mainnet-beta.solana.com";

// Built once (the transports connect lazily, so this is safe at module scope).
const SOLANA_RPCS = {
  "solana:mainnet": {
    rpc: createSolanaRpc(SOLANA_RPC),
    rpcSubscriptions: createSolanaRpcSubscriptions(SOLANA_WSS),
    blockExplorerUrl: "https://explorer.solana.com",
  },
} as const;

/** Normalized auth shape consumed across the app. */
export interface AuthUser {
  address: string | null;
  email: string | null;
  loginMethod: string | null;
}

export interface AuthState {
  ready: boolean;
  authenticated: boolean;
  user: AuthUser | null;
  login: () => void;
  logout: () => void | Promise<void>;
  /** True when running without a Privy app id (demo mode). */
  isDemo: boolean;
}

const AuthContext = createContext<AuthState | null>(null);

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within <AuthProvider>");
  return ctx;
}

const PRIVY_APP_ID = process.env.NEXT_PUBLIC_PRIVY_APP_ID;

/* ------------------------------------------------------------------ */
/* Demo provider — used when no Privy app id is configured.            */
/* Generates a deterministic-looking Solana address and persists it.   */
/* ------------------------------------------------------------------ */

const B58 = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
const STORAGE_KEY = "cw_demo_user";

function fakeSolanaAddress(): string {
  let out = "";
  for (let i = 0; i < 44; i++) {
    out += B58[Math.floor(Math.random() * B58.length)];
  }
  return out;
}

function DemoAuthProvider({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(false);
  const [user, setUser] = useState<AuthUser | null>(null);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) setUser(JSON.parse(raw));
    } catch {
      /* ignore */
    }
    setReady(true);
  }, []);

  const login = useCallback(() => {
    const next: AuthUser = {
      address: fakeSolanaAddress(),
      email: "chad@chadwallet.xyz",
      loginMethod: "demo",
    };
    setUser(next);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {
      /* ignore */
    }
  }, []);

  const logout = useCallback(() => {
    setUser(null);
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      /* ignore */
    }
  }, []);

  const value = useMemo<AuthState>(
    () => ({
      ready,
      authenticated: !!user,
      user,
      login,
      logout,
      isDemo: true,
    }),
    [ready, user, login, logout]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

/* ------------------------------------------------------------------ */
/* Privy bridge — maps Privy state into the shared AuthState shape.    */
/* ------------------------------------------------------------------ */

function PrivyBridge({ children }: { children: React.ReactNode }) {
  const { ready, authenticated, user, login, logout } = usePrivy();
  const { wallets } = useSolanaWallets();

  const value = useMemo<AuthState>(() => {
    const address = wallets?.[0]?.address ?? null;
    const email =
      user?.email?.address ??
      user?.google?.email ??
      user?.apple?.email ??
      null;
    const loginMethod =
      user?.google ? "google" : user?.apple ? "apple" : email ? "email" : null;

    return {
      ready,
      authenticated,
      user: authenticated ? { address, email, loginMethod } : null,
      login: () => login(),
      logout,
      isDemo: false,
    };
  }, [ready, authenticated, user, wallets, login, logout]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

function PrivyAuthProvider({ children }: { children: React.ReactNode }) {
  return (
    <PrivyProvider
      appId={PRIVY_APP_ID as string}
      config={{
        appearance: {
          theme: "dark",
          accentColor: "#22e07b",
          logo: "/brand/logo-dark.png",
          walletChainType: "solana-only",
          showWalletLoginFirst: false,
        },
        loginMethods: ["google", "apple", "email"],
        embeddedWallets: {
          solana: { createOnLogin: "users-without-wallets" },
          ethereum: { createOnLogin: "off" },
          showWalletUIs: true,
        },
        solana: { rpcs: SOLANA_RPCS },
      }}
    >
      <PrivyBridge>{children}</PrivyBridge>
    </PrivyProvider>
  );
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  if (PRIVY_APP_ID) return <PrivyAuthProvider>{children}</PrivyAuthProvider>;
  return <DemoAuthProvider>{children}</DemoAuthProvider>;
}
