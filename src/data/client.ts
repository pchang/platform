import type { MethodOption } from '../ontology/methods';
import type { CommitResult, DraftView, MethodComposition, NavigationDomain, NotificationView, ObjectSummary, ObjectView, Principal, RunView, ToDoItem } from '../gateway/gateway';

/**
 * How the experience layer talks to the gateway. Two implementations share this interface:
 * HTTP to a running gateway, and the gateway running inside the page for previews (platform
 * spec section 3.4). Every request is made as a principal; the gateway enforces the rules.
 */

export type { CommitResult, DraftView, MethodComposition, MethodOption, NavigationDomain, NotificationView, ObjectSummary, ObjectView, Principal, RunView, ToDoItem };

/** A refusal from the gateway, with its reasons for the person. */
export class RefusedError extends Error {
  constructor(readonly reasons: string[]) {
    super(reasons.join('; '));
  }
}

export interface Person {
  person: string;
  name: string;
  roles: { role: string; label: string }[];
}

export interface GatewayClient {
  /** The people to act as, for the development persona switcher. */
  people(): Promise<Person[]>;
  navigation(principal: Principal): Promise<NavigationDomain[]>;
  todo(principal: Principal): Promise<ToDoItem[]>;
  find(principal: Principal, type: string): Promise<ObjectSummary[]>;
  /** Rejects with RefusedError when the principal may not read the object. */
  read(principal: Principal, object: string): Promise<ObjectView>;
  /** The methods on an object, each available or blocked with its reasons. */
  methods(principal: Principal, object: string): Promise<MethodOption[]>;
  compose(principal: Principal, object: string, method: string): Promise<MethodComposition>;
  /** Rejects with RefusedError when the method would fail. */
  preview(principal: Principal, object: string, method: string, inputs: Record<string, string>): Promise<Omit<CommitResult, 'commit'>>;
  /** Rejects with RefusedError when the gateway refuses the commit. */
  commit(principal: Principal, object: string, method: string, inputs: Record<string, string>, signature?: { typedName: string }, draft?: { draft: string; text: string }): Promise<CommitResult>;
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
