import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode, type RefObject } from 'react';
import { RefusedError, type AskResult, type AskTurn, type MethodOption, type ObjectView } from '../data/client';
import { useProcesses } from '../processes/ProcessProvider';
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

/** The object a conversation is about (design system spec 4.1, Ask about this): as the person may read it, with its methods. */
export interface ChatAbout {
  object: ObjectView;
  methods: MethodOption[];
}

interface ChatContext {
  isOpen: boolean;
  open: () => void;
  close: () => void;
  toggle: () => void;
  turns: ChatTurn[];
  send: (question: string) => void;
  newConversation: () => void;
  /** Starts a conversation about an object, opening the chat (design system spec 4.1, Ask about this). */
  askAbout: (object: string) => void;
  /** The object the conversation is about, once read; undefined for a general conversation. */
  about?: ChatAbout;
  /** True while the object asked about is being read. */
  aboutLoading: boolean;
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
  const [aboutIri, setAboutIri] = useState<string>();
  const [about, setAbout] = useState<ChatAbout>();
  const { changes } = useProcesses();
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
    setAboutIri(undefined);
  }, [owner]);

  // The object asked about, read as the person, and read again after any method runs, so its state and methods are current.
  useEffect(() => {
    if (!aboutIri) {
      setAbout(undefined);
      return;
    }
    let cancelled = false;
    Promise.all([client.read(principal, aboutIri), client.methods(principal, aboutIri)]).then(
      ([object, methods]) => !cancelled && setAbout({ object, methods }),
      () => !cancelled && setAboutIri(undefined),
    );
    return () => {
      cancelled = true;
    };
  }, [client, principal, aboutIri, changes]);
  const aboutRef = useRef(aboutIri);
  aboutRef.current = aboutIri;

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
      // Every question in a conversation about an object is about it (platform spec 5.2, About an object).
      client.ask(principal, q, earlier, aboutRef.current ? [aboutRef.current] : []).then(
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
      newConversation: () => {
        setTurns([]);
        setAboutIri(undefined);
      },
      askAbout: (object: string) => {
        setTurns([]);
        setAbout(undefined);
        setAboutIri(object);
        setOpen(true);
      },
      about: about && about.object.iri === aboutIri ? about : undefined,
      aboutLoading: Boolean(aboutIri) && !(about && about.object.iri === aboutIri),
      trigger,
    }),
    [isOpen, close, turns, send, about, aboutIri],
  );
  return <Context.Provider value={value}>{children}</Context.Provider>;
}

export function useChat(): ChatContext {
  const context = useContext(Context);
  if (!context) throw new Error('useChat must be used inside ChatProvider');
  return context;
}
