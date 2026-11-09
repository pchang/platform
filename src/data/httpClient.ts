import type { GatewayClient, Principal } from './client';

/** The client for a running gateway, over HTTP (platform spec section 3.4). Uses development-mode identity. */
export function httpClient(base = '/api'): GatewayClient {
  const get = async (path: string, principal?: Principal) => {
    const res = await fetch(`${base}${path}`, {
      headers: principal ? { 'x-lsh-person': principal.person, 'x-lsh-role': principal.role } : {},
    });
    const body = await res.json();
    if (!res.ok) throw new Error((body.reasons ?? ['The gateway refused the request']).join('; '));
    return body;
  };
  return {
    people: () => get('/dev/people'),
    navigation: (p) => get('/navigation', p),
    todo: (p) => get('/todo', p),
    find: (p, type) => get(`/objects?type=${encodeURIComponent(type)}`, p),
  };
}
