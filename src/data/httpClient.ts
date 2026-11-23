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
    // A session that ends mid-use brings the person back to sign in (design system spec 4.1, Signing in).
    if (res.status === 401 && path !== '/me') window.location.reload();
    if (!res.ok) throw new RefusedError(json.reasons ?? ['The gateway refused the request'], res.status);
    return json;
  };
  const methodPath = (object: string, method: string) => `/objects/${encodeURIComponent(object)}/methods/${encodeURIComponent(method)}`;
  return {
    me: () => request('/me'),
    people: () => request('/dev/people'),
    navigation: (p) => request('/navigation', p),
    todo: (p) => request('/todo', p),
    home: (p) => request('/home', p),
    metricObjects: (p, metric) => request(`/metrics/${encodeURIComponent(metric)}`, p),
    search: (p, query, options = {}) => request(`/search?q=${encodeURIComponent(query)}${options.understand === 'ontology' ? '&understand=ontology' : ''}`, p),
    ask: (p, question, earlier = [], about = []) => request('/ask', p, { question, earlier, about }),
    find: (p, type) => request(`/objects?type=${encodeURIComponent(type)}`, p),
    read: (p, object) => request(`/objects/${encodeURIComponent(object)}`, p),
    compose: (p, object, method) => request(methodPath(object, method), p),
    preview: (p, object, method, inputs) => request(`${methodPath(object, method)}/preview`, p, { inputs }),
    commit: (p, object, method, inputs, signature, draft, proposal) => request(methodPath(object, method), p, { inputs, ...(signature ? { signature } : {}), ...(draft ? { draft } : {}), ...(proposal ? { proposal } : {}) }),
    propose: (p, objects, method) => (objects.length === 1 ? request(`${methodPath(objects[0], method)}/propose`, p, {}) : request(`/sets/${encodeURIComponent(method)}/propose`, p, { objects })),
    draft: (p, object, method) => request(`${methodPath(object, method)}/draft`, p, {}),
    getDraft: (p, draft) => request(`/drafts/${encodeURIComponent(draft.split('/').pop()!)}`, p),
    discardDraft: (p, draft) => request(`/drafts/${encodeURIComponent(draft.split('/').pop()!)}/discard`, p, {}),
    methods: (p, object) => request(`/objects/${encodeURIComponent(object)}/methods`, p),
    createForm: (p, type, parent) => request(`/types/${encodeURIComponent(type)}/form${parent ? `?parent=${encodeURIComponent(parent)}` : ''}`, p),
    previewCreate: (p, type, values, parent) => request(`/types/${encodeURIComponent(type)}/preview`, p, { values, ...(parent ? { parent } : {}) }),
    create: (p, type, values, parent) => request(`/types/${encodeURIComponent(type)}`, p, { values, ...(parent ? { parent } : {}) }),
    editBlocks: async (p, object) => (await request(`/objects/${encodeURIComponent(object)}/editable`, p)).blocks,
    editForm: (p, object) => request(`/objects/${encodeURIComponent(object)}/edit`, p),
    previewEdit: (p, object, values) => request(`/objects/${encodeURIComponent(object)}/edit/preview`, p, { values }),
    edit: (p, object, values) => request(`/objects/${encodeURIComponent(object)}/edit`, p, { values }),
    setMethods: (p, objects) => request('/sets', p, { objects }),
    composeSet: (p, objects, method) => request(`/sets/${encodeURIComponent(method)}`, p, { objects }),
    previewSet: (p, objects, method, inputs) => request(`/sets/${encodeURIComponent(method)}/preview`, p, { objects, inputs }),
    commitSet: (p, objects, method, inputs, proposal) => request(`/sets/${encodeURIComponent(method)}/commit`, p, { objects, inputs, ...(proposal ? { proposal } : {}) }),
    runs: (p, filter = {}) => {
      const query = new URLSearchParams({ ...(filter.object ? { object: filter.object } : {}), ...(filter.active ? { active: 'true' } : {}) }).toString();
      return request(`/runs${query ? `?${query}` : ''}`, p);
    },
    run: (p, run) => request(`/runs/${encodeURIComponent(run)}`, p),
    notifications: (p) => request('/notifications', p),
    markRead: async (p, notifications) => {
      await request('/notifications/read', p, notifications ? { notifications } : {});
    },
  };
}
