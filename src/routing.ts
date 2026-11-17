import { useSyncExternalStore } from 'react';
import { NS } from './ontology/ontology';

/**
 * Hash routes, so the app works on any static host. Ontology-driven navigation (platform spec 5.1) decides
 * which routes a person sees; these are their addresses.
 */
export type Route =
  | { name: 'home' }
  | { name: 'todo' }
  | { name: 'glance'; initiative?: string }
  | { name: 'catalog' }
  | { name: 'type'; type: string }
  | { name: 'search'; query: string };

let cachedHash: string | undefined;
let cachedRoute: Route = { name: 'home' };

function parse(hash: string): Route {
  const path = hash.replace(/^#\/?/, '').replace(/\/$/, '');
  if (path === 'catalog') return { name: 'catalog' };
  if (path === 'todo') return { name: 'todo' };
  if (path === 'glance') return { name: 'glance' };
  const glance = path.match(/^glance\/([A-Za-z0-9._-]+)$/);
  if (glance) return { name: 'glance', initiative: glance[1] };
  const type = path.match(/^type\/([A-Za-z0-9]+)$/);
  if (type) return { name: 'type', type: `${NS.ls}${type[1]}` };
  const search = path.match(/^search\/(.+)$/);
  if (search) {
    try {
      return { name: 'search', query: decodeURIComponent(search[1]) };
    } catch {
      return { name: 'search', query: search[1] };
    }
  }
  // Home: where the person's role opens, To do or At a glance (platform spec 3.3, Altitude).
  return { name: 'home' };
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
  if (route.name === 'type') return `#/type/${route.type.split('#').pop()}`;
  if (route.name === 'search') return `#/search/${encodeURIComponent(route.query)}`;
  if (route.name === 'todo') return '#/todo';
  if (route.name === 'glance') return route.initiative ? `#/glance/${route.initiative}` : '#/glance';
  return '#/';
}
