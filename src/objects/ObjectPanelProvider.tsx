import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { usePrincipal } from '../principal/PrincipalProvider';

/**
 * The object panel's state (design system spec 4.4): the objects the person has moved through, newest last, and whether
 * the panel takes the whole content area. Opening from the page starts afresh; opening from inside the panel moves in.
 */
export interface ObjectPanelContext {
  /** The objects opened, the one shown last. Empty while the panel is closed. */
  stack: string[];
  /** How the last change moved: in to a related object, back out, a step through the list, or a fresh start. */
  moved: 'in' | 'back' | 'step' | 'fresh';
  /** Opens an object from the page, in place of whatever the panel showed. `origin` gets focus back on close. */
  open: (object: string, origin?: HTMLElement) => void;
  /** Opens a related object from inside the panel, keeping the way back. */
  moveIn: (object: string, origin?: HTMLElement) => void;
  /** Where the object shown is in the list it was opened from, when it was opened from one (design system spec 4.4). */
  position?: { index: number; total: number };
  /** Shows the object before, or after, the one shown, in the list it was opened from. */
  step: (by: -1 | 1) => void;
  /** Steps back to the previous object. */
  back: () => void;
  /** Closes the whole panel. */
  close: () => void;
  isExpanded: boolean;
  toggleExpanded: () => void;
}

const Context = createContext<ObjectPanelContext | null>(null);

/** Whether the panel takes the whole content area: a choice kept on the device (design system spec 4.4). */
/** A card the panel was opened from is given focus through its title, its button. */
function focusOrigin(origin: HTMLElement | undefined) {
  if (!origin?.isConnected) return;
  const target = origin.matches('.app-openable-card') ? origin.querySelector<HTMLElement>('.app-card-open') : origin;
  target?.focus();
}

/**
 * The list an object was opened from, in its order as the person saw it: the objects of the cards or rows around the one
 * chosen, as the renderer marks them. Undefined when the object was not opened from a list of several.
 */
function listAround(object: string, origin: HTMLElement | undefined): string[] | undefined {
  const list = origin?.closest('.pf-v6-l-gallery, table');
  if (!list) return undefined;
  const objects = [...new Set([...list.querySelectorAll<HTMLElement>('[data-opens]')].map((e) => e.dataset.opens!))];
  return objects.length > 1 && objects.includes(object) ? objects : undefined;
}

export function ObjectPanelProvider({ children }: { children: ReactNode }) {
  const { principal } = usePrincipal();
  const [stack, setStack] = useState<string[]>([]);
  // For each object in the stack, the list it was opened from, if any.
  const [lists, setLists] = useState<(string[] | undefined)[]>([]);
  const [moved, setMoved] = useState<ObjectPanelContext['moved']>('fresh');
  // Every object opened from the page opens at three quarters, as a peek; Expand lasts while the person moves through the
  // panel, until it closes or another object is opened from the page (design system spec 4.4).
  const [isExpanded, setExpanded] = useState(false);
  const origin = useRef<HTMLElement>(undefined);

  // Another person sees their own world: the panel closes when the person changes.
  useEffect(() => {
    setStack([]);
    setLists([]);
  }, [principal]);

  const open = useCallback((object: string, from?: HTMLElement) => {
    origin.current = from;
    setMoved('fresh');
    setExpanded(false);
    setStack([object]);
    setLists([listAround(object, from)]);
  }, []);
  const moveIn = useCallback(
    (object: string, from?: HTMLElement) => {
      if (stack.at(-1) === object) return;
      setMoved('in');
      setStack([...stack, object]);
      setLists([...lists, listAround(object, from)]);
    },
    [stack, lists],
  );
  const back = useCallback(() => {
    setMoved('back');
    setStack((s) => s.slice(0, -1));
    setLists((l) => l.slice(0, -1));
  }, []);
  // Previous and Next: the neighbour takes the shown object's place; the way back, if any, stays (design system spec 4.4).
  const list = lists.at(-1);
  const index = list && stack.length ? list.indexOf(stack.at(-1)!) : -1;
  const position = list && index >= 0 ? { index, total: list.length } : undefined;
  const step = useCallback(
    (by: -1 | 1) => {
      if (!list || index < 0) return;
      const next = list[index + by];
      if (!next) return;
      setMoved('step');
      setStack((s) => [...s.slice(0, -1), next]);
    },
    [list, index],
  );
  const close = useCallback(() => {
    setStack([]);
    setLists([]);
    setExpanded(false);
    const from = origin.current;
    origin.current = undefined;
    // After the panel has gone, so focus lands on the page, not on the panel that is closing.
    setTimeout(() => focusOrigin(from), 0);
  }, []);
  const toggleExpanded = useCallback(() => setExpanded((e) => !e), []);

  const value = useMemo(
    () => ({ stack, moved, open, moveIn, back, close, isExpanded, toggleExpanded, step, ...(position ? { position } : {}) }),
    [stack, moved, open, moveIn, back, close, isExpanded, toggleExpanded, step, position?.index, position?.total],
  );
  return <Context.Provider value={value}>{children}</Context.Provider>;
}

export function useObjectPanel(): ObjectPanelContext {
  const context = useContext(Context);
  if (!context) throw new Error('useObjectPanel needs an ObjectPanelProvider');
  return context;
}
