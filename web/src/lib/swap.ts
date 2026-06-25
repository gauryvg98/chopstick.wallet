"use client";

import { useCallback, useState } from "react";
import { useSignTransaction, useWallets } from "@privy-io/react-auth/solana";

const API = (process.env.NEXT_PUBLIC_API_BASE ?? "").replace(/\/$/, "");

export const SOL_MINT = "So11111111111111111111111111111111111111112";

export type SwapStage =
  | "idle"
  | "building"
  | "signing"
  | "sending"
  | "confirming"
  | "done"
  | "error";

export interface SwapParams {
  inputMint: string;
  outputMint: string;
  /** Raw integer input amount in base units, as a decimal string. */
  amount: string;
  slippageBps: number;
}

export interface SwapResult {
  signature?: string;
  error?: string;
}

function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function bytesToBase64(bytes: Uint8Array): string {
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin);
}

type ConfirmResult = "confirmed" | "failed" | "dropped";

// Solana drops transactions that aren't included before their blockhash expires,
// so a single broadcast often never lands. We poll for the status AND re-broadcast
// the same signed tx every couple seconds (idempotent — same signature) until it
// confirms, reverts, or the blockhash window (~60s) closes.
async function confirmWithRebroadcast(
  sig: string,
  sendBody: string
): Promise<ConfirmResult> {
  for (let i = 0; i < 24; i++) {
    await new Promise((r) => setTimeout(r, 2500));
    try {
      const res = await fetch(`${API}/api/tx/${sig}`);
      if (res.ok) {
        const { status } = await res.json();
        if (status === "confirmed" || status === "finalized") return "confirmed";
        if (status === "failed") return "failed";
      }
    } catch {
      /* keep trying */
    }
    // Re-broadcast (best-effort) to keep the tx in front of the leaders.
    fetch(`${API}/api/swap/send`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: sendBody,
    }).catch(() => {});
  }
  return "dropped";
}

/**
 * Orchestrates a real on-chain swap: build (Jupiter, via backend) → sign (Privy
 * embedded wallet) → broadcast (backend RPC) → poll for confirmation. The wallet
 * key never leaves Privy and the RPC key never leaves the backend.
 */
export function useSwap() {
  const { signTransaction } = useSignTransaction();
  const { wallets } = useWallets();
  const [stage, setStage] = useState<SwapStage>("idle");
  const [error, setError] = useState<string | null>(null);
  const [signature, setSignature] = useState<string | null>(null);

  const reset = useCallback(() => {
    setStage("idle");
    setError(null);
    setSignature(null);
  }, []);

  const swap = useCallback(
    async (params: SwapParams): Promise<SwapResult> => {
      const wallet = wallets?.[0];
      if (!wallet) {
        setStage("error");
        setError("No wallet connected");
        return { error: "No wallet connected" };
      }
      setError(null);
      setSignature(null);
      try {
        // 1. Build the unsigned swap transaction.
        setStage("building");
        const buildRes = await fetch(`${API}/api/swap/build`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ ...params, userPublicKey: wallet.address }),
        });
        if (!buildRes.ok) {
          throw new Error(
            (await buildRes.json().catch(() => ({})))?.error ?? "Could not build swap"
          );
        }
        const { swapTransaction } = await buildRes.json();

        // 2. Sign with the Privy embedded wallet (user approves).
        setStage("signing");
        const { signedTransaction } = await signTransaction({
          transaction: base64ToBytes(swapTransaction),
          wallet,
          chain: "solana:mainnet",
        });

        // 3. Broadcast via the backend's RPC.
        setStage("sending");
        const sendBody = JSON.stringify({
          signedTransaction: bytesToBase64(signedTransaction),
        });
        const sendRes = await fetch(`${API}/api/swap/send`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: sendBody,
        });
        if (!sendRes.ok) {
          throw new Error(
            (await sendRes.json().catch(() => ({})))?.error ?? "Broadcast failed"
          );
        }
        const { signature: sig } = await sendRes.json();
        setSignature(sig);

        // 4. Confirm, re-broadcasting until it lands (or the blockhash expires).
        setStage("confirming");
        const outcome = await confirmWithRebroadcast(sig, sendBody);
        if (outcome === "failed")
          throw new Error("Transaction reverted on-chain (check Solscan).");
        if (outcome === "dropped")
          throw new Error(
            "Transaction didn't land — the blockhash likely expired. Try again and approve quickly."
          );

        setStage("done");
        return { signature: sig };
      } catch (e) {
        const msg =
          e instanceof Error ? e.message : "Swap failed — please try again";
        setStage("error");
        setError(msg);
        return { error: msg };
      }
    },
    [wallets, signTransaction]
  );

  return { swap, stage, error, signature, reset };
}
