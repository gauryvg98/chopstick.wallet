import type { ApiClient } from "./types";
import { MockClient } from "./mock";
import { LiveClient } from "./live";

export * from "./types";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE;

let client: ApiClient | null = null;

/**
 * Returns the active data client. Uses the Go backend when
 * NEXT_PUBLIC_API_BASE is configured, otherwise realistic mock data.
 */
export function getClient(): ApiClient {
  if (client) return client;
  client = API_BASE ? new LiveClient(API_BASE) : new MockClient();
  return client;
}

/** Whether the app is running against real backend data. */
export const IS_LIVE = !!API_BASE;
