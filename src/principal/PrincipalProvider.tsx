import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { gatewayClient, type GatewayClient, type Person, type Principal } from '../data/client';

/**
 * Who the experience is acting as. Until an identity provider exists (platform spec 3.4), development
 * and previews pick a person and role from the seed graph with the persona switcher (design system 4.1).
 */

interface PrincipalContext {
  client: GatewayClient;
  people: Person[];
  principal: Principal;
  name: string;
  roleLabel: string;
  setPrincipal: (principal: Principal) => void;
}

const Context = createContext<PrincipalContext | null>(null);
const STORAGE_KEY = 'lsh.principal';
/** The first persona shown: the Drug Safety Physician has the fullest To do in the seed graph. */
const DEFAULT_PERSON_SUFFIX = 'person-chloe';

function stored(): Principal | undefined {
  try {
    const value = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null');
    return value && typeof value.person === 'string' && typeof value.role === 'string' ? value : undefined;
  } catch {
    return undefined;
  }
}

export function PrincipalProvider({ children, fallback }: { children: ReactNode; fallback: ReactNode }) {
  const [state, setState] = useState<{ client: GatewayClient; people: Person[] } | { error: string }>();
  const [principal, setPrincipalState] = useState<Principal>();

  useEffect(() => {
    let cancelled = false;
    gatewayClient()
      .then(async (client) => ({ client, people: await client.people() }))
      .then(
        (loaded) => {
          if (cancelled) return;
          setState(loaded);
          const saved = stored();
          const valid = saved && loaded.people.some((p) => p.person === saved.person && p.roles.some((r) => r.role === saved.role));
          const first = loaded.people.find((p) => p.person.endsWith(DEFAULT_PERSON_SUFFIX)) ?? loaded.people[0];
          setPrincipalState(valid ? saved : { person: first.person, role: first.roles[0].role });
        },
        (error: unknown) => !cancelled && setState({ error: error instanceof Error ? error.message : String(error) }),
      );
    return () => {
      cancelled = true;
    };
  }, []);

  const setPrincipal = useCallback((next: Principal) => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {
      // Not remembered on this device; still applies until the page closes.
    }
    setPrincipalState(next);
  }, []);

  const value = useMemo(() => {
    if (!state || 'error' in state || !principal) return null;
    const person = state.people.find((p) => p.person === principal.person);
    return {
      ...state,
      principal,
      name: person?.name ?? principal.person,
      roleLabel: person?.roles.find((r) => r.role === principal.role)?.label ?? principal.role,
      setPrincipal,
    };
  }, [state, principal, setPrincipal]);

  if (state && 'error' in state) return <>{`The gateway could not start: ${state.error}`}</>;
  if (!value) return <>{fallback}</>;
  return <Context.Provider value={value}>{children}</Context.Provider>;
}

export function usePrincipal(): PrincipalContext {
  const value = useContext(Context);
  if (!value) throw new Error('usePrincipal must be used inside PrincipalProvider');
  return value;
}
