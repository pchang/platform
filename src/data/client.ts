import type { MethodOption } from '../ontology/methods';
import type { AskTurn } from '../gateway/ask';
import type { AskResult, CommitResult, ComparisonView, DraftView, FormField, ObjectForm, MethodComposition, NavigationDomain, NotificationView, ObjectSummary, ObjectView, Principal, RelationshipEnd, RunView, SearchResult, SetMethodOption, ToDoItem } from '../gateway/gateway';

/**
 * How the experience layer talks to the gateway. Two implementations share this interface:
 * HTTP to a running gateway, and the gateway running inside the page for previews (platform
 * spec section 3.4). Every request is made as a principal; the gateway enforces the rules.
 */

export type { AskResult, AskTurn, CommitResult, ComparisonView, DraftView, FormField, ObjectForm, SetMethodOption, SearchResult, MethodComposition, MethodOption, NavigationDomain, NotificationView, ObjectSummary, ObjectView, Principal, RelationshipEnd, RunView, ToDoItem };

/** A refusal from the gateway, with its reasons for the person. */
export class RefusedError extends Error {
  /** The HTTP status, over HTTP: 401 means the person must sign in (platform spec 3.4, Identity). */
  constructor(
    readonly reasons: string[],
    readonly status?: number,
  ) {
    super(reasons.join('; '));
  }
}

/**
 * Who the page is acting for (design system spec 4.1, Signing in): a preview or development, where anyone may be acted
 * as; a demo deployment, signed in and acting as any person; or a signed-in account acting as its own person.
 */
export type Me =
  | { mode: 'preview' | 'development' }
  | { mode: 'demo'; account: { email: string; name: string } }
  | { mode: 'signed-in'; account: { email: string; name: string }; person: Person };

export interface Person {
  person: string;
  name: string;
  roles: { role: string; label: string }[];
}

export interface GatewayClient {
  /** Who the page acts for. Rejects with RefusedError, status 401, when the person must sign in. */
  me(): Promise<Me>;
  /** The people to act as, for the persona switcher in development, previews and demo deployments. */
  people(): Promise<Person[]>;
  navigation(principal: Principal): Promise<NavigationDomain[]>;
  todo(principal: Principal): Promise<ToDoItem[]>;
  find(principal: Principal, type: string): Promise<ObjectSummary[]>;
  /** Search (platform spec 5.2): how the query was understood, and the objects it found, best first. */
  /** With understand 'ontology', the model is not asked, as for the suggestions under the search field. */
  search(principal: Principal, query: string, options?: { understand?: 'model' | 'ontology' }): Promise<SearchResult>;
  /** Ask (platform spec 5.2, Asking a question): a connected model's answer and the objects it cites, or the search it fell back to. */
  /** Earlier turns of the conversation go with the question, so a follow-up is understood. */
  /** About: identifiers of the objects the question is asked from (platform spec 5.2, About an object). */
  ask(principal: Principal, question: string, earlier?: AskTurn[], about?: string[]): Promise<AskResult>;
  /** Rejects with RefusedError when the principal may not read the object. */
  read(principal: Principal, object: string): Promise<ObjectView>;
  /** The methods on an object, each available or blocked with its reasons. */
  methods(principal: Principal, object: string): Promise<MethodOption[]>;
  compose(principal: Principal, object: string, method: string): Promise<MethodComposition>;
  /** Rejects with RefusedError when the method would fail. */
  preview(principal: Principal, object: string, method: string, inputs: Record<string, string>): Promise<Omit<CommitResult, 'commit'>>;
  /** Rejects with RefusedError when the gateway refuses the commit. */
  commit(principal: Principal, object: string, method: string, inputs: Record<string, string>, signature?: { typedName: string }, draft?: { draft: string; text: string }): Promise<CommitResult>;
  /** The form to create an object of a type, inside a parent when given (platform spec 5.3, Creating and editing objects). */
  createForm(principal: Principal, type: string, parent?: string): Promise<ObjectForm>;
  previewCreate(principal: Principal, type: string, values: Record<string, string>, parent?: string): Promise<Omit<CommitResult, 'commit'>>;
  create(principal: Principal, type: string, values: Record<string, string>, parent?: string): Promise<CommitResult>;
  /** Why the object cannot be edited now; empty when it can. */
  editBlocks(principal: Principal, object: string): Promise<string[]>;
  editForm(principal: Principal, object: string): Promise<ObjectForm>;
  previewEdit(principal: Principal, object: string, values: Record<string, string>): Promise<Omit<CommitResult, 'commit'>>;
  edit(principal: Principal, object: string, values: Record<string, string>): Promise<CommitResult>;
  /** The set methods a selection qualifies for (platform spec 5.4, Acting on a set). */
  setMethods(principal: Principal, objects: string[]): Promise<SetMethodOption[]>;
  /** Compose a set method for a selection, with its comparison. Rejects with RefusedError when the set does not qualify. */
  composeSet(principal: Principal, objects: string[], method: string): Promise<MethodComposition>;
  previewSet(principal: Principal, objects: string[], method: string, inputs: Record<string, string>): Promise<Omit<CommitResult, 'commit'>>;
  /** Commits a set method once, on the chosen object. */
  commitSet(principal: Principal, objects: string[], method: string, inputs: Record<string, string>): Promise<CommitResult>;
  /** A connected model drafts the method. Rejects with RefusedError when no model is connected or it declines. */
  draft(principal: Principal, object: string, method: string): Promise<DraftView>;
  discardDraft(principal: Principal, draft: string): Promise<DraftView>;
  /** Reads a draft back, such as when a set-aside process is restored. */
  getDraft(principal: Principal, draft: string): Promise<DraftView>;
  /** Background runs on objects the principal may read, newest first. */
  runs(principal: Principal, filter?: { object?: string; active?: boolean }): Promise<RunView[]>;
  run(principal: Principal, run: string): Promise<RunView>;
  /** The principal's notifications, newest first. */
  notifications(principal: Principal): Promise<NotificationView[]>;
  /** Marks the given notifications read, or all of them. */
  markRead(principal: Principal, notifications?: string[]): Promise<void>;
}

let client: Promise<GatewayClient> | undefined;

/** The page's client: in-page unless VITE_GATEWAY is "http". The in-page gateway loads only when used. */
export function gatewayClient(): Promise<GatewayClient> {
  client ??=
    import.meta.env.VITE_GATEWAY === 'http'
      ? import('./httpClient').then((m) => m.httpClient())
      : import('./inPageClient').then((m) => m.inPageClient());
  return client;
}
