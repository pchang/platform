import { RefusedError, type GatewayClient, type Principal } from './client';

/** The client for a running gateway, over HTTP (platform spec section 3.4). Uses development-mode identity. */
export function httpClient(base = '/api'): GatewayClient {
  const request = async (path: string, principal?: Principal, body?: unknown) => {
    const res = await fetch(`${base}${path}`, {
      method: body === undefined ? 'GET' : 'POST',
      headers: {
        ...(principal ? { 'x-lsh-person': principal.person, 'x-lsh-role': principal.role } : {}),
        ...(body === undefined ? {} : { 'content-type': 'application/json' }),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    const json = await res.json();
    if (!res.ok) throw new RefusedError(json.reasons ?? ['The gateway refused the request']);
    return json;
  };
  const methodPath = (object: string, method: string) => `/objects/${encodeURIComponent(object)}/methods/${encodeURIComponent(method)}`;
  return {
    people: () => request('/dev/people'),
    navigation: (p) => request('/navigation', p),
    todo: (p) => request('/todo', p),
    find: (p, type) => request(`/objects?type=${encodeURIComponent(type)}`, p),
    compose: (p, object, method) => request(methodPath(object, method), p),
    preview: (p, object, method, inputs) => request(`${methodPath(object, method)}/preview`, p, { inputs }),
    commit: (p, object, method, inputs) => request(methodPath(object, method), p, { inputs }),
  };
}
