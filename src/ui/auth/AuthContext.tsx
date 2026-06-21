/**
 * Mock authentication. Real login/multi-tenant accounts are later backend work
 * (the contract has no auth endpoints yet) — here we just track which mosque you
 * signed in as and in what capacity, so the gates can render the right surface.
 *
 *   collect → the shared mosque collecting account (we don't track the individual)
 *   admin   → a team member with dashboard access (treasurer / trustee)
 */
import { createContext, useContext, useMemo, useState, type ReactNode } from 'react';
import { COLLECTING_OPERATOR_ID, DEMO_MOSQUE_ID } from '../../core/api-client';

export interface CollectAuth {
  kind: 'collect';
  mosqueId: string;
  mosqueName: string;
  operatorId: string;
}
export interface AdminAuth {
  kind: 'admin';
  mosqueId: string;
  mosqueName: string;
  name: string;
}
export type Auth = CollectAuth | AdminAuth | null;

const DEMO = {
  mosqueId: DEMO_MOSQUE_ID,
  mosqueName: 'Masjid Al-Noor',
  operatorId: COLLECTING_OPERATOR_ID,
  adminName: 'Aisha Rahman',
};

interface AuthValue {
  auth: Auth;
  signInCollect: (a?: Partial<Omit<CollectAuth, 'kind'>>) => void;
  signInAdmin: (a?: Partial<Omit<AdminAuth, 'kind'>>) => void;
  signOut: () => void;
}

const AuthContext = createContext<AuthValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [auth, setAuth] = useState<Auth>(null);

  const value = useMemo<AuthValue>(
    () => ({
      auth,
      signInCollect: (a) =>
        setAuth({
          kind: 'collect',
          mosqueId: a?.mosqueId ?? DEMO.mosqueId,
          mosqueName: a?.mosqueName ?? DEMO.mosqueName,
          operatorId: a?.operatorId ?? DEMO.operatorId,
        }),
      signInAdmin: (a) =>
        setAuth({
          kind: 'admin',
          mosqueId: a?.mosqueId ?? DEMO.mosqueId,
          mosqueName: a?.mosqueName ?? DEMO.mosqueName,
          name: a?.name ?? DEMO.adminName,
        }),
      signOut: () => setAuth(null),
    }),
    [auth],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
