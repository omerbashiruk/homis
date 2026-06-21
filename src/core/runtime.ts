/**
 * Isomorphic runtime helpers so the contract + mock backend run unchanged in
 * BOTH Node (Dev A, tsx, tests) and the browser (Dev B, Vite bundle). This is
 * what lets Dev B demo the whole product against mock data with no backend.
 *
 * Avoids `node:crypto` and bare `process.env`, neither of which exists in the
 * browser.
 */

/** A unique id, using Web Crypto (present in modern browsers and Node ≥19). */
export function randomId(): string {
  const c = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto;
  if (c && typeof c.randomUUID === 'function') return c.randomUUID();
  // Fallback for exotic runtimes — fine for non-cryptographic mock ids.
  return `id-${Date.now().toString(16)}-${Math.floor(Math.random() * 1e9).toString(16)}`;
}

/** Read an env var if a `process.env` exists; otherwise undefined (browser). */
export function readEnv(key: string): string | undefined {
  const p = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process;
  return p && p.env ? p.env[key] : undefined;
}
