import type { CommitResult, MethodComposition, NavigationDomain, ObjectSummary, Principal, ToDoItem } from '../gateway/gateway';

/**
 * How the experience layer talks to the gateway. Two implementations share this interface:
 * HTTP to a running gateway, and the gateway running inside the page for previews (platform
 * spec section 3.4). Every request is made as a principal; the gateway enforces the rules.
 */

export type { CommitResult, MethodComposition, NavigationDomain, ObjectSummary, Principal, ToDoItem };

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
  compose(principal: Principal, object: string, method: string): Promise<MethodComposition>;
  /** Rejects with RefusedError when the method would fail. */
  preview(principal: Principal, object: string, method: string, inputs: Record<string, string>): Promise<Omit<CommitResult, 'commit'>>;
  /** Rejects with RefusedError when the gateway refuses the commit. */
  commit(principal: Principal, object: string, method: string, inputs: Record<string, string>): Promise<CommitResult>;
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
