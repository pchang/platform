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
  /** Starts a conversation about an object, or several, opening the chat (design system spec 4.1, Ask about this). */
  askAbout: (objects: string | string[]) => void;
  /** The objects the conversation is about, once read, in order; undefined for a general conversation. */
  about?: ChatAbout[];
  /** True while the objects asked about are being read. */
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
  /** The objects it is about, in order: one from Ask about this, or the objects chosen in a list. */
  aboutIris?: string[];
  /** Its name in the history, once they are read: one object's identifier and title, or several objects' identifiers. */
  aboutName?: string;
}

/** Several objects' name in the history: their identifiers, the first three and how many more (design system spec 4.1). */
export const namesOf = (identifiers: string[]) =>
  identifiers.length <= 3
    ? identifiers.join(identifiers.length === 3 ? ', ' : ' and ').replace(/, ([^,]*)$/, ' and $1')
    : `${identifiers.slice(0, 3).join(', ')} and ${identifiers.length - 3} more`;

/** A conversation's name in the history: its objects, else its first question, else "New conversation". */
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
  const fresh = (aboutIris?: string[]): Conversation => ({ id: `c${next.current++}`, turns: [], ...(aboutIris?.length ? { aboutIris } : {}) });
  const [initial] = useState(() => fresh());
  const history: History = histories[owner] ?? { conversations: [initial], current: initial.id };
  const current = history.conversations.find((c) => c.id === history.current) ?? history.conversations[0];
  const aboutIris = current.aboutIris;
  // A stable key for the objects asked about, so reading them again waits for a real change.
  const aboutKey = aboutIris?.join(' ') ?? '';
  const [about, setAbout] = useState<{ key: string; objects: ChatAbout[] }>();
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

  // The objects asked about, read as the person, and read again after any method runs, so their state and methods are current.
  useEffect(() => {
    if (!aboutKey) {
      setAbout(undefined);
      return;
    }
    let cancelled = false;
    const id = current.id;
    const iris = aboutKey.split(' ');
    Promise.all(iris.map((iri) => Promise.all([client.read(principal, iri), client.methods(principal, iri)]))).then(
      (read) => {
        if (cancelled) return;
        const objects = read.map(([object, methods]) => ({ object, methods }));
        setAbout({ key: aboutKey, objects });
        const name = objects.length === 1 ? `${objects[0].object.identifier} · ${objects[0].object.title}` : namesOf(objects.map((o) => o.object.identifier));
        updateConversation(owner, id, (c) => ({ ...c, aboutName: name }));
      },
      () => !cancelled && setAbout(undefined),
    );
    return () => {
      cancelled = true;
    };
  }, [client, principal, aboutKey, changes, current.id, owner, updateConversation]);

  const close = useCallback(() => {
    setOpen(false);
    trigger.current?.focus();
  }, []);

  /** Starts a conversation, about objects or not. One not yet begun is reused rather than kept empty. */
  const start = useCallback(
    (objectIris?: string[]) =>
      update(owner, (h) => {
        const now = h.conversations.find((c) => c.id === h.current);
        const rest = h.conversations.filter((c) => c.turns.length || c.aboutIris || c.id === h.current);
        if (now && !now.turns.length && (now.aboutIris ?? []).join(' ') === (objectIris ?? []).join(' ')) return h;
        const kept = now && !now.turns.length ? rest.filter((c) => c.id !== now.id) : rest;
        const started = fresh(objectIris);
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
      // Every question in a conversation about objects is about them (platform spec 5.2, About an object).
      client.ask(principal, q, earlier, conversation.aboutIris ?? []).then(
        (result) => settle({ status: 'answered', result }),
        (e: unknown) => settle({ status: 'failed', reasons: e instanceof RefusedError ? e.reasons : [String(e)] }),
      );
    },
    [client, principal, current, owner, updateConversation],
  );

  const shownAbout = about && about.key === aboutKey ? about.objects : undefined;
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
      askAbout: (objects: string | string[]) => {
        setAbout(undefined);
        start(typeof objects === 'string' ? [objects] : objects);
        setOpen(true);
      },
      about: shownAbout,
      aboutLoading: Boolean(aboutKey) && !shownAbout,
      // Begun conversations, newest first, with the one in front even before it begins.
      conversations: history.conversations.filter((c) => c.turns.length || c.aboutIris || c.id === current.id),
      currentId: current.id,
      select: (id: string) => update(owner, (h) => (h.conversations.some((c) => c.id === id) ? { ...h, current: id } : h)),
      trigger,
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [isOpen, close, current, send, start, shownAbout, aboutKey, history, owner, update],
  );
  return <Context.Provider value={value}>{children}</Context.Provider>;
}

export function useChat(): ChatContext {
  const context = useContext(Context);
  if (!context) throw new Error('useChat must be used inside ChatProvider');
  return context;
}
