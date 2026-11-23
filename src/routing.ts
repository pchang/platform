import { useSyncExternalStore } from 'react';
import { NS } from './ontology/ontology';

/**
 * Hash routes, so the app works on any static host. Ontology-driven navigation (platform spec 5.1) decides
 * which routes a person sees; these are their addresses.
 */
export type Route = { name: 'todo' } | { name: 'catalog' } | { name: 'type'; type: string } | { name: 'metric'; metric: string } | { name: 'search'; query: string };

let cachedHash: string | undefined;
let cachedRoute: Route = { name: 'todo' };

/**
 * A type or metric in an address: its name alone in the domain's namespace, as before, or with a prefix for any other,
 * such as p:ChangeSet or skos:Concept for the platform's own structure (platform spec 3.7).
 */
const fromAddress = (prefix: string | undefined, name: string) => `${(prefix && (NS as Record<string, string>)[prefix]) || NS.ls}${name}`;

export function toAddress(iri: string): string {
  if (iri.startsWith(NS.ls) && !iri.slice(NS.ls.length).includes('/')) return iri.slice(NS.ls.length);
  const prefixed = Object.entries(NS).find(([, ns]) => iri.startsWith(ns) && !iri.slice(ns.length).includes('/'));
  return prefixed ? `${prefixed[0]}:${iri.slice(prefixed[1].length)}` : iri.split(/[#/]/).pop()!;
}

function parse(hash: string): Route {
  const path = hash.replace(/^#\/?/, '').replace(/\/$/, '');
  if (path === 'catalog') return { name: 'catalog' };
  const type = path.match(/^type\/(?:([a-z]+):)?([A-Za-z0-9]+)$/);
  if (type) return { name: 'type', type: fromAddress(type[1], type[2]) };
  const metric = path.match(/^metric\/(?:([a-z]+):)?([A-Za-z0-9-]+)$/);
  if (metric) return { name: 'metric', metric: fromAddress(metric[1], metric[2]) };
  const search = path.match(/^search\/(.+)$/);
  if (search) {
    try {
      return { name: 'search', query: decodeURIComponent(search[1]) };
    } catch {
      return { name: 'search', query: search[1] };
    }
  }
  return { name: 'todo' };
}

function current(): Route {
  const hash = window.location.hash || import.meta.env.VITE_DEFAULT_ROUTE || '#/';
  if (hash !== cachedHash) {
    cachedHash = hash;
    cachedRoute = parse(hash);
  }
  return cachedRoute;
}

function subscribe(onChange: () => void) {
  window.addEventListener('hashchange', onChange);
  return () => window.removeEventListener('hashchange', onChange);
}

export function useRoute(): Route {
  return useSyncExternalStore(subscribe, current, current);
}

export function routeHref(route: Route): string {
  if (route.name === 'catalog') return '#/catalog';
  if (route.name === 'type') return `#/type/${toAddress(route.type)}`;
  if (route.name === 'metric') return `#/metric/${toAddress(route.metric)}`;
  if (route.name === 'search') return `#/search/${encodeURIComponent(route.query)}`;
  return '#/';
}
