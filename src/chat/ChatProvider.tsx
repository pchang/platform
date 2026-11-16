import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode, type RefObject } from 'react';
import { RefusedError, type AskResult, type AskTurn, type MethodOption, type ObjectView } from '../data/client';
import { useProcesses } from '../processes/ProcessProvider';
import { usePrincipal } from '../principal/PrincipalProvider';

/**
 * The conversations in the chat panel (design system spec 4.1, Ask; platform spec 5.2, In a conversation): each
 * person's own, kept for the session, so nobody sees another's.
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
  /** The person's conversations, newest first (design system spec 4.1, Conversations and their history). */
  conversations: Conversation[];
  /** The conversation in front. */
  currentId: string;
  /** Brings an earlier conversation to the front. */
  select: (id: string) => void;
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

/** One conversation: its turns, and the object it is about, if any (design system spec 4.1, Conversations and their history). */
export interface Conversation {
  id: string;
  turns: ChatTurn[];
  aboutIri?: string;
  /** The object's identifier and title, once read, to name the conversation in the history. */
  aboutName?: string;
}

/** A conversation's name in the history: its object, else its first question, else "New conversation". */
export const nameOf = (c: Conversation) => c.aboutName ?? c.turns[0]?.question ?? 'New conversation';

/** A person's conversations, newest first, and the one in front. */
interface History {
  conversations: Conversation[];
  current: string;
}

export function ChatProvider({ children }: { children: ReactNode }) {
  const { client, principal } = usePrincipal();
  const [isOpen, setOpen] = useState(false);
  // Each person's own history, for the session only (design system spec 4.1): never shown to another person.
  const owner = `${principal.person} ${principal.role}`;
  const [histories, setHistories] = useState<Record<string, History>>({});
  const next = useRef(1);
  const fresh = (aboutIri?: string): Conversation => ({ id: `c${next.current++}`, turns: [], ...(aboutIri ? { aboutIri } : {}) });
  const [initial] = useState(() => fresh());
  const history: History = histories[owner] ?? { conversations: [initial], current: initial.id };
  const current = history.conversations.find((c) => c.id === history.current) ?? history.conversations[0];
  const aboutIri = current.aboutIri;
  const [about, setAbout] = useState<ChatAbout>();
  const { changes } = useProcesses();
  const trigger = useRef<HTMLButtonElement | null>(null);

  /** Changes the person's own history. */
  const update = useCallback(
    (owned: string, change: (h: History) => History) =>
      setHistories((all) => {
        const mine = all[owned] ?? { conversations: [initial], current: initial.id };
        return { ...all, [owned]: change(mine) };
      }),
    [initial],
  );
  const updateConversation = useCallback(
    (owned: string, id: string, change: (c: Conversation) => Conversation) =>
      update(owned, (h) => ({ ...h, conversations: h.conversations.map((c) => (c.id === id ? change(c) : c)) })),
    [update],
  );

  // The object asked about, read as the person, and read again after any method runs, so its state and methods are current.
  useEffect(() => {
    if (!aboutIri) {
      setAbout(undefined);
      return;
    }
    let cancelled = false;
    const id = current.id;
    Promise.all([client.read(principal, aboutIri), client.methods(principal, aboutIri)]).then(
      ([object, methods]) => {
        if (cancelled) return;
        setAbout({ object, methods });
        updateConversation(owner, id, (c) => ({ ...c, aboutName: `${object.identifier} · ${object.title}` }));
      },
      () => !cancelled && setAbout(undefined),
    );
    return () => {
      cancelled = true;
    };
  }, [client, principal, aboutIri, changes, current.id, owner, updateConversation]);

  const close = useCallback(() => {
    setOpen(false);
    trigger.current?.focus();
  }, []);

  /** Starts a conversation, about an object or not. One not yet begun is reused rather than kept empty. */
  const start = useCallback(
    (objectIri?: string) =>
      update(owner, (h) => {
        const now = h.conversations.find((c) => c.id === h.current);
        const rest = h.conversations.filter((c) => c.turns.length || c.aboutIri || c.id === h.current);
        if (now && !now.turns.length && now.aboutIri === objectIri) return h;
        const kept = now && !now.turns.length ? rest.filter((c) => c.id !== now.id) : rest;
        const started = fresh(objectIri);
        return { conversations: [started, ...kept], current: started.id };
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [owner, update],
  );

  const send = useCallback(
    (question: string) => {
      const q = question.trim();
      if (!q) return;
      const turnId = next.current++;
      const conversation = current;
      const earlier: AskTurn[] = conversation.turns
        .filter((t) => t.status === 'answered' && t.result)
        .map((t) => ({ question: t.question, answer: saidIn(t.result!) }));
      const asker = owner;
      updateConversation(asker, conversation.id, (c) => ({ ...c, turns: [...c.turns, { id: turnId, question: q, status: 'waiting' }] }));
      const settle = (change: Partial<ChatTurn>) =>
        updateConversation(asker, conversation.id, (c) => ({ ...c, turns: c.turns.map((t) => (t.id === turnId ? { ...t, ...change } : t)) }));
      // Every question in a conversation about an object is about it (platform spec 5.2, About an object).
      client.ask(principal, q, earlier, conversation.aboutIri ? [conversation.aboutIri] : []).then(
        (result) => settle({ status: 'answered', result }),
        (e: unknown) => settle({ status: 'failed', reasons: e instanceof RefusedError ? e.reasons : [String(e)] }),
      );
    },
    [client, principal, current, owner, updateConversation],
  );

  const shownAbout = about && about.object.iri === aboutIri ? about : undefined;
  const value = useMemo<ChatContext>(
    () => ({
      isOpen,
      open: () => setOpen(true),
      close,
      toggle: () => (isOpen ? close() : setOpen(true)),
      turns: current.turns,
      send,
      newConversation: () => start(),
      // Every Ask about this starts a new conversation; the one before stays in the history.
      askAbout: (object: string) => {
        setAbout(undefined);
        start(object);
        setOpen(true);
      },
      about: shownAbout,
      aboutLoading: Boolean(aboutIri) && !shownAbout,
      // Begun conversations, newest first, with the one in front even before it begins.
      conversations: history.conversations.filter((c) => c.turns.length || c.aboutIri || c.id === current.id),
      currentId: current.id,
      select: (id: string) => update(owner, (h) => (h.conversations.some((c) => c.id === id) ? { ...h, current: id } : h)),
      trigger,
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [isOpen, close, current, send, start, shownAbout, aboutIri, history, owner, update],
  );
  return <Context.Provider value={value}>{children}</Context.Provider>;
}

export function useChat(): ChatContext {
  const context = useContext(Context);
  if (!context) throw new Error('useChat must be used inside ChatProvider');
  return context;
}
