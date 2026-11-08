import { useSyncExternalStore } from 'react';

/**
 * Hash routes, so the app works on any static host. Ontology-driven navigation
 * (platform spec 5.1) will replace this as views arrive.
 */
export type Route = 'home' | 'catalog';

function current(): Route {
  const hash = window.location.hash || import.meta.env.VITE_DEFAULT_ROUTE || '#/';
  return hash.replace(/\/$/, '') === '#/catalog' ? 'catalog' : 'home';
}

function subscribe(onChange: () => void) {
  window.addEventListener('hashchange', onChange);
  return () => window.removeEventListener('hashchange', onChange);
}

export function useRoute(): Route {
  return useSyncExternalStore(subscribe, current, current);
}
