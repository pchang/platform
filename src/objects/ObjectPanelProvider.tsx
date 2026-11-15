import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { usePrincipal } from '../principal/PrincipalProvider';

/**
 * The object panel's state (design system spec 4.4): the objects the person has moved through, newest last, and whether
 * the panel takes the whole content area. Opening from the page starts afresh; opening from inside the panel moves in.
 */
export interface ObjectPanelContext {
  /** The objects opened, the one shown last. Empty while the panel is closed. */
  stack: string[];
  /** How the last change moved: in to a related object, back out, or a fresh start. */
  moved: 'in' | 'back' | 'fresh';
  /** Opens an object from the page, in place of whatever the panel showed. `origin` gets focus back on close. */
  open: (object: string, origin?: HTMLElement) => void;
  /** Opens a related object from inside the panel, keeping the way back. */
  moveIn: (object: string) => void;
  /** Steps back to the previous object. */
  back: () => void;
  /** Closes the whole panel. */
  close: () => void;
  isExpanded: boolean;
  toggleExpanded: () => void;
}

const Context = createContext<ObjectPanelContext | null>(null);

/** Whether the panel takes the whole content area: a choice kept on the device (design system spec 4.4). */
const EXPANDED_KEY = 'lsh.objectPanel.expanded';
function loadExpanded(): boolean {
  try {
    return localStorage.getItem(EXPANDED_KEY) === 'true';
  } catch {
    return false;
  }
}
function saveExpanded(expanded: boolean) {
  try {
    localStorage.setItem(EXPANDED_KEY, String(expanded));
  } catch {
    // Not kept on this device; the choice still applies until the page closes.
  }
}

/** A card the panel was opened from is given focus through its title, its button. */
function focusOrigin(origin: HTMLElement | undefined) {
  if (!origin?.isConnected) return;
  const target = origin.matches('.app-openable-card') ? origin.querySelector<HTMLElement>('.app-card-open') : origin;
  target?.focus();
}

export function ObjectPanelProvider({ children }: { children: ReactNode }) {
  const { principal } = usePrincipal();
  const [stack, setStack] = useState<string[]>([]);
  const [moved, setMoved] = useState<ObjectPanelContext['moved']>('fresh');
  const [isExpanded, setExpanded] = useState(loadExpanded);
  const origin = useRef<HTMLElement>(undefined);

  // Another person sees their own world: the panel closes when the person changes.
  useEffect(() => setStack([]), [principal]);

  const open = useCallback((object: string, from?: HTMLElement) => {
    origin.current = from;
    setMoved('fresh');
    setStack([object]);
  }, []);
  const moveIn = useCallback((object: string) => {
    setMoved('in');
    setStack((s) => (s.at(-1) === object ? s : [...s, object]));
  }, []);
  const back = useCallback(() => {
    setMoved('back');
    setStack((s) => s.slice(0, -1));
  }, []);
  const close = useCallback(() => {
    setStack([]);
    const from = origin.current;
    origin.current = undefined;
    // After the panel has gone, so focus lands on the page, not on the panel that is closing.
    setTimeout(() => focusOrigin(from), 0);
  }, []);
  const toggleExpanded = useCallback(() => {
    setExpanded((e) => {
      saveExpanded(!e);
      return !e;
    });
  }, []);

  const value = useMemo(() => ({ stack, moved, open, moveIn, back, close, isExpanded, toggleExpanded }), [stack, moved, open, moveIn, back, close, isExpanded, toggleExpanded]);
  return <Context.Provider value={value}>{children}</Context.Provider>;
}

export function useObjectPanel(): ObjectPanelContext {
  const context = useContext(Context);
  if (!context) throw new Error('useObjectPanel needs an ObjectPanelProvider');
  return context;
}
