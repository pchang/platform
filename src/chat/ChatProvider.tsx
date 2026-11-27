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
  /** Starts a conversation about an object, or the chosen objects, opening the chat (design system spec 4.1, Ask about this, About the chosen). */
  askAbout: (objects: string | string[]) => void;
  /** The objects the conversation is about, once read; empty for a general conversation. */
  about: ChatAbout[];
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
  /** Conversations set aside in the process dock, in the order they were set aside (design system spec 4.1, Setting a conversation aside). */
  aside: Conversation[];
  /** Sends the conversation in front to the dock and closes the chat; one not yet begun is simply closed. */
  minimize: () => void;
  /** Opens the chat on a set-aside conversation; a begun conversation in front goes to the dock in its place. */
  restore: (id: string) => void;
  /** Takes a conversation out of the dock; it stays in the history. */
  dismiss: (id: string) => void;
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

/** One conversation: its turns, and the objects it is about, if any (design system spec 4.1, Conversations and their history). */
export interface Conversation {
  id: string;
  turns: ChatTurn[];
  aboutIris?: string[];
  /** The object's identifier and title, or the objects' identifiers, once read, to name the conversation in the history. */
  aboutName?: string;
  /** True when an answer arrived while the conversation was set aside, until it is restored. */
  answeredWhileAside?: boolean;
}

/** The same objects, in the same order: a conversation about them not yet begun is reused. */
const sameObjects = (a: string[] = [], b: string[] = []) => a.length === b.length && a.every((x, i) => x === b[i]);

/** A conversation's name in the history: its object, else its first question, else "New conversation". */
export const nameOf = (c: Conversation) => c.aboutName ?? c.turns[0]?.question ?? 'New conversation';

/** A person's conversations, newest first, the one in front, and those set aside in the dock. */
interface History {
  conversations: Conversation[];
  current: string;
  aside?: string[];
}

const begun = (c?: Conversation) => Boolean(c && (c.turns.length || c.aboutIris));

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
  const aboutKey = aboutIris?.join(' ') ?? '';
  const [about, setAbout] = useState<ChatAbout[]>([]);
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
    const iris = aboutKey ? aboutKey.split(' ') : [];
    if (!iris.length) {
      setAbout([]);
      return;
    }
    let cancelled = false;
    const id = current.id;
    Promise.all(iris.map((iri) => Promise.all([client.read(principal, iri), client.methods(principal, iri)]))).then(
      (read) => {
        if (cancelled) return;
        setAbout(read.map(([object, methods]) => ({ object, methods })));
        // One object is named by its identifier and title; several by their identifiers.
        const name = read.length === 1 ? `${read[0][0].identifier} · ${read[0][0].title}` : read.map(([o]) => o.identifier).join(', ');
        updateConversation(owner, id, (c) => ({ ...c, aboutName: name }));
      },
      () => !cancelled && setAbout([]),
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
        if (now && !now.turns.length && sameObjects(now.aboutIris, objectIris)) return h;
        const kept = now && !now.turns.length ? rest.filter((c) => c.id !== now.id) : rest;
        const started = fresh(objectIris);
        return { ...h, conversations: [started, ...kept], current: started.id };
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
      // An answer that arrives while the conversation is set aside is marked, so the dock can say it is ready.
      const settle = (change: Partial<ChatTurn>) =>
        update(asker, (h) => ({
          ...h,
          conversations: h.conversations.map((c) =>
            c.id === conversation.id
              ? { ...c, turns: c.turns.map((t) => (t.id === turnId ? { ...t, ...change } : t)), ...(h.aside?.includes(c.id) && change.status === 'answered' ? { answeredWhileAside: true } : {}) }
              : c,
          ),
        }));
      // Every question in a conversation about objects is about all of them (platform spec 5.2, About an object).
      client.ask(principal, q, earlier, conversation.aboutIris ?? []).then(
        (result) => settle({ status: 'answered', result }),
        (e: unknown) => settle({ status: 'failed', reasons: e instanceof RefusedError ? e.reasons : [String(e)] }),
      );
    },
    [client, principal, current, owner, updateConversation],
  );

  const shownAbout = about.length && sameObjects(about.map((a) => a.object.iri), aboutIris) ? about : [];
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
        setAbout([]);
        start(typeof objects === 'string' ? [objects] : [...objects]);
        setOpen(true);
      },
      about: shownAbout,
      aboutLoading: Boolean(aboutIris?.length) && !shownAbout.length,
      // Begun conversations, newest first, with the one in front even before it begins.
      conversations: history.conversations.filter((c) => c.turns.length || c.aboutIris || c.id === current.id),
      currentId: current.id,
      // Choosing a set-aside conversation from the history restores it: it leaves the dock.
      select: (id: string) =>
        update(owner, (h) => (h.conversations.some((c) => c.id === id) ? { ...h, current: id, aside: (h.aside ?? []).filter((x) => x !== id) } : h)),
      trigger,
      aside: (history.aside ?? []).map((id) => history.conversations.find((c) => c.id === id)).filter((c): c is Conversation => Boolean(c)),
      minimize: () => {
        update(owner, (h) => {
          const now = h.conversations.find((c) => c.id === h.current);
          if (!begun(now)) return h;
          // The chat opens again on a new conversation; the one set aside waits in the dock.
          const started = fresh();
          return { conversations: [started, ...h.conversations], current: started.id, aside: [...(h.aside ?? []).filter((x) => x !== now!.id), now!.id] };
        });
        close();
      },
      restore: (id: string) => {
        update(owner, (h) => {
          if (!h.conversations.some((c) => c.id === id)) return h;
          const now = h.conversations.find((c) => c.id === h.current);
          const rest = (h.aside ?? []).filter((x) => x !== id);
          // A begun conversation in front goes to the dock in its place; a process in front is not touched.
          const aside = isOpen && begun(now) && now!.id !== id ? [...rest, now!.id] : rest;
          return { conversations: h.conversations.map((c) => (c.id === id ? { ...c, answeredWhileAside: false } : c)), current: id, aside };
        });
        setOpen(true);
      },
      dismiss: (id: string) => update(owner, (h) => ({ ...h, aside: (h.aside ?? []).filter((x) => x !== id) })),
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [isOpen, close, current, send, start, shownAbout, aboutIris, history, owner, update],
  );
  return <Context.Provider value={value}>{children}</Context.Provider>;
}

export function useChat(): ChatContext {
  const context = useContext(Context);
  if (!context) throw new Error('useChat must be used inside ChatProvider');
  return context;
}
