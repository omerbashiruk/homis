/**
 * Demo roster for the seeded mosque. In production the signed-in operator comes
 * from auth; the contract has no "list operators" call by design, so for the
 * mock demo we name the two seeded operators here.
 */
export interface DemoOperator {
  id: string;
  name: string;
  role: string;
}

export const DEMO_OPERATORS: DemoOperator[] = [
  { id: 'op_yusuf', name: 'Yusuf Khan', role: 'operator' },
  { id: 'op_aisha', name: 'Aisha Rahman', role: 'admin' },
];

export function newIdempotencyKey(): string {
  const c = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto;
  if (c && typeof c.randomUUID === 'function') return c.randomUUID();
  return `key-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
}

export function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
