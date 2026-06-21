/**
 * Operator store: a React reducer for the collecting loop, parameterised by the
 * signed-in mosque's collecting account. Async actions go through
 * src/core/api-client.ts only — no component ever calls fetch.
 *
 * There is no session UI any more: collecting opens straight onto the donation
 * options. A session is created invisibly (one per device, auto-dated) purely so
 * the contract has something to attach donations to; the operator never names it.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  type ReactNode,
} from 'react';
import {
  donate as apiDonate,
  getFunds,
  getSession,
  startSession as apiStartSession,
  undoDonation,
  type Donation,
  type Fund,
  type Session,
  type SessionState,
} from '../../core/api-client';
import { delay, newIdempotencyKey } from '../lib/demo';

type Phase = 'collecting' | 'processing' | 'confirm' | 'declined';

type View = 'purpose' | 'amount';

interface OperatorState {
  selectedFundId: string | null;
  amountPence: number;
  view: View;
  phase: Phase;
  lastDonation: Donation | null;
  declineReason: string | null;
}

interface AppState {
  mosqueId: string;
  operatorId: string;
  funds: Fund[];
  ready: boolean;
  error: string | null;
  session: Session | null;
  sessionState: SessionState | null;
  operator: OperatorState;
}

type Action =
  | { type: 'ready'; funds: Fund[] }
  | { type: 'error'; error: string | null }
  | { type: 'session'; session: Session | null }
  | { type: 'sessionState'; sessionState: SessionState | null }
  | { type: 'selectFund'; fundId: string }
  | { type: 'view'; view: View }
  | { type: 'digit'; d: number }
  | { type: 'backspace' }
  | { type: 'clearAmount' }
  | { type: 'setAmount'; pence: number }
  | { type: 'phase'; phase: Phase }
  | { type: 'confirmed'; donation: Donation }
  | { type: 'declined'; reason: string }
  | { type: 'resetEntry' };

const MAX_AMOUNT = 1_000_000_00; // £1,000,000 sanity cap

function opReduce(op: OperatorState, action: Action): OperatorState {
  switch (action.type) {
    case 'selectFund':
      return { ...op, selectedFundId: action.fundId };
    case 'view':
      return { ...op, view: action.view };
    case 'digit': {
      const next = op.amountPence * 10 + action.d;
      return next > MAX_AMOUNT ? op : { ...op, amountPence: next };
    }
    case 'backspace':
      return { ...op, amountPence: Math.floor(op.amountPence / 10) };
    case 'clearAmount':
      return { ...op, amountPence: 0 };
    case 'setAmount':
      return { ...op, amountPence: Math.min(action.pence, MAX_AMOUNT) };
    case 'phase':
      return { ...op, phase: action.phase };
    case 'confirmed':
      return { ...op, phase: 'confirm', lastDonation: action.donation, declineReason: null };
    case 'declined':
      return { ...op, phase: 'declined', declineReason: action.reason };
    case 'resetEntry':
      return { ...op, amountPence: 0, phase: 'collecting', declineReason: null };
    default:
      return op;
  }
}

function reduce(state: AppState, action: Action): AppState {
  switch (action.type) {
    case 'ready':
      return { ...state, ready: true, funds: action.funds };
    case 'error':
      return { ...state, error: action.error };
    case 'session':
      return { ...state, session: action.session };
    case 'sessionState':
      return { ...state, sessionState: action.sessionState };
    default:
      return { ...state, operator: opReduce(state.operator, action) };
  }
}

export interface StoreActions {
  choosePurpose: (fundId: string) => void;
  changePurpose: () => void;
  pushDigit: (d: number) => void;
  backspace: () => void;
  clearAmount: () => void;
  setAmount: (pence: number) => void;
  takePayment: () => Promise<void>;
  nextDonor: () => void;
  retry: () => void;
  dismissResult: () => void;
  undoLast: () => Promise<void>;
}

interface StoreValue {
  state: AppState;
  actions: StoreActions;
  /** Active (non-archived) donation options, in display order. */
  options: Fund[];
}

const StoreContext = createContext<StoreValue | null>(null);

function autoSessionLabel(): string {
  const today = new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
  return `Collection — ${today}`;
}

export function StoreProvider({
  mosqueId,
  operatorId,
  children,
}: {
  mosqueId: string;
  operatorId: string;
  children: ReactNode;
}) {
  const [state, dispatch] = useReducer(reduce, undefined, () => ({
    mosqueId,
    operatorId,
    funds: [],
    ready: false,
    error: null,
    session: null,
    sessionState: null,
    operator: {
      selectedFundId: null,
      amountPence: 0,
      view: 'purpose' as View,
      phase: 'collecting' as Phase,
      lastDonation: null,
      declineReason: null,
    },
  }));

  const stateRef = useRef(state);
  stateRef.current = state;

  const refreshSession = useCallback(async () => {
    const session = stateRef.current.session;
    if (!session) return;
    const next = await getSession(session.id);
    dispatch({ type: 'sessionState', sessionState: next });
  }, []);

  // Bootstrap: load options, auto-select the first, and silently open a session.
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const funds = await getFunds(mosqueId);
        if (!alive) return;
        dispatch({ type: 'ready', funds });
        const session = await apiStartSession({ mosqueId, operatorId, label: autoSessionLabel() });
        if (!alive) return;
        dispatch({ type: 'session', session });
        const fresh = await getSession(session.id);
        if (alive) dispatch({ type: 'sessionState', sessionState: fresh });
      } catch (err) {
        if (alive) dispatch({ type: 'error', error: errMsg(err) });
      }
    })();
    return () => {
      alive = false;
    };
  }, [mosqueId, operatorId]);

  const takePayment = useCallback<StoreActions['takePayment']>(async () => {
    const { operator, session } = stateRef.current;
    if (!session || !operator.selectedFundId || operator.amountPence <= 0) return;

    dispatch({ type: 'phase', phase: 'processing' });
    try {
      await delay(750); // the reader animation needs a beat; the real tap also takes a moment
      const result = await apiDonate(session.id, {
        fundId: operator.selectedFundId,
        amountPence: operator.amountPence,
        idempotencyKey: newIdempotencyKey(),
      });
      if (result.status === 'confirmed') {
        dispatch({ type: 'confirmed', donation: result.donation });
        await refreshSession();
      } else if (result.status === 'declined') {
        dispatch({ type: 'declined', reason: result.reason });
      } else {
        dispatch({ type: 'phase', phase: 'collecting' }); // cancelled
      }
    } catch (err) {
      dispatch({ type: 'declined', reason: errMsg(err) });
    }
  }, [refreshSession]);

  const undoLast = useCallback<StoreActions['undoLast']>(async () => {
    const ss = stateRef.current.sessionState;
    const last = ss?.recentDonations.find((d) => d.status === 'confirmed');
    if (!last) return;
    try {
      await undoDonation(last.id);
      await refreshSession();
    } catch (err) {
      dispatch({ type: 'error', error: errMsg(err) });
    }
  }, [refreshSession]);

  const actions = useMemo<StoreActions>(
    () => ({
      choosePurpose: (fundId) => {
        dispatch({ type: 'selectFund', fundId });
        dispatch({ type: 'view', view: 'amount' });
      },
      changePurpose: () => dispatch({ type: 'view', view: 'purpose' }),
      pushDigit: (d) => dispatch({ type: 'digit', d }),
      backspace: () => dispatch({ type: 'backspace' }),
      clearAmount: () => dispatch({ type: 'clearAmount' }),
      setAmount: (pence) => dispatch({ type: 'setAmount', pence }),
      takePayment,
      nextDonor: () => {
        dispatch({ type: 'resetEntry' });
        dispatch({ type: 'view', view: 'amount' });
      },
      retry: () => dispatch({ type: 'phase', phase: 'collecting' }),
      dismissResult: () => {
        dispatch({ type: 'resetEntry' });
        dispatch({ type: 'view', view: 'amount' });
      },
      undoLast,
    }),
    [takePayment, undoLast],
  );

  const options = useMemo(() => state.funds.filter((f) => !f.archived), [state.funds]);
  const value = useMemo(() => ({ state, actions, options }), [state, actions, options]);
  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export function useStore(): StoreValue {
  const ctx = useContext(StoreContext);
  if (!ctx) throw new Error('useStore must be used within StoreProvider');
  return ctx;
}

export function fundById(funds: Fund[], id: string | null): Fund | undefined {
  return id ? funds.find((f) => f.id === id) : undefined;
}

function errMsg(err: unknown): string {
  if (err && typeof err === 'object' && 'message' in err) return String((err as { message: unknown }).message);
  return 'Something went wrong';
}
