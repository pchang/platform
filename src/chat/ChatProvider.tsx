import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode, type RefObject } from 'react';
import { RefusedError, type AskResult, type AskTurn } from '../data/client';
import { usePrincipal } from '../principal/PrincipalProvider';

/**
 * The conversation in the chat panel (design system spec 4.1, Ask; platform spec 5.2, In a conversation). One per
 * person: choosing another person in Profile starts a new one, so nobody sees another's conversation.
 */

export interface ChatTurn {
  id: number;
  question: string;
  status: 'waiting' | 'answered' | 'failed';
  result?: AskResult;
  reasons?: string[];
}

interface ChatContext {
  isOpen: boolean;
  open: () => void;
  close: () => void;
  toggle: () => void;
  turns: ChatTurn[];
  send: (question: string) => void;
  newConversation: () => void;
  /** The Ask button, so closing the panel returns focus to it. */
  trigger: RefObject<HTMLButtonElement | null>;
}

const Context = createContext<ChatContext | null>(null);

/** What a reply said, as the next question's earlier turn: the answer's text, or what the search found. Never records. */
export function saidIn(result: AskResult): string {
  if (result.answer) return result.answer.text;
  const search = result.search;
  if (!search?.total) return `${result.searched ?? ''} Nothing matched.`.trim();
  const found = search.results.slice(0, 10).map((r) => r.object.identifier).join(', ');
  return `${result.searched ?? ''} The search found ${search.total}: ${found}${search.total > 10 ? ', and more' : ''}.`.trim();
}

export function ChatProvider({ children }: { children: ReactNode }) {
  const { client, principal } = usePrincipal();
  const [isOpen, setOpen] = useState(false);
  const [turns, setTurns] = useState<ChatTurn[]>([]);
  const trigger = useRef<HTMLButtonElement | null>(null);
  const next = useRef(1);
  // The conversation belongs to the person asking: another person starts afresh, and late replies are dropped.
  const owner = `${principal.person} ${principal.role}`;
  const ownerRef = useRef(owner);
  const turnsRef = useRef(turns);
  turnsRef.current = turns;
  useEffect(() => {
    ownerRef.current = owner;
    setTurns([]);
  }, [owner]);

  const close = useCallback(() => {
    setOpen(false);
    trigger.current?.focus();
  }, []);

  const send = useCallback(
    (question: string) => {
      const q = question.trim();
      if (!q) return;
      const id = next.current++;
      const asker = ownerRef.current;
      const earlier: AskTurn[] = turnsRef.current
        .filter((t) => t.status === 'answered' && t.result)
        .map((t) => ({ question: t.question, answer: saidIn(t.result!) }));
      setTurns((all) => [...all, { id, question: q, status: 'waiting' }]);
      client.ask(principal, q, earlier).then(
        (result) => asker === ownerRef.current && setTurns((now) => now.map((t) => (t.id === id ? { ...t, status: 'answered', result } : t))),
        (e: unknown) =>
          asker === ownerRef.current &&
          setTurns((now) => now.map((t) => (t.id === id ? { ...t, status: 'failed', reasons: e instanceof RefusedError ? e.reasons : [String(e)] } : t))),
      );
    },
    [client, principal],
  );

  const value = useMemo<ChatContext>(
    () => ({
      isOpen,
      open: () => setOpen(true),
      close,
      toggle: () => (isOpen ? close() : setOpen(true)),
      turns,
      send,
      newConversation: () => setTurns([]),
      trigger,
    }),
    [isOpen, close, turns, send],
  );
  return <Context.Provider value={value}>{children}</Context.Provider>;
}

export function useChat(): ChatContext {
  const context = useContext(Context);
  if (!context) throw new Error('useChat must be used inside ChatProvider');
  return context;
}
