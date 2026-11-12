import * as oxigraph from 'oxigraph';
import wasmUrl from 'oxigraph/web_bg.wasm?url';
import { Gateway, GatewayError } from '../gateway/gateway';
import { loadGraph } from '../ontology/ontology';
import { RefusedError, type GatewayClient } from './client';

/**
 * The gateway running inside the page, for previews (platform spec section 3.4, Previews): the same
 * gateway code, with the ontology and seed graph bundled into the page, and no journal. Nothing is saved.
 */

const ontology = import.meta.glob('/ontology/**/*.ttl', { query: '?raw', import: 'default', eager: true }) as Record<string, string>;
const seed = import.meta.glob('/data/life-sciences/seed.ttl', { query: '?raw', import: 'default', eager: true }) as Record<string, string>;

/**
 * In the browser, Oxigraph's WebAssembly module loads before first use. A preview built as one file carries
 * the module inside the page as a data URL; it is decoded and loaded directly, with no request, because a
 * preview page may not be allowed to fetch. Elsewhere it is fetched from beside the page.
 */
async function loadOxigraph() {
  const web = oxigraph as unknown as { default?: (input?: unknown) => Promise<unknown>; initSync?: (input: unknown) => unknown };
  if (typeof web.default !== 'function') return; // The server build is ready without loading.
  if (wasmUrl.startsWith('data:')) {
    const bytes = Uint8Array.from(atob(wasmUrl.slice(wasmUrl.indexOf(',') + 1)), (c) => c.charCodeAt(0));
    web.initSync!({ module: bytes });
  } else {
    await web.default({ module_or_path: wasmUrl });
  }
}

/** The gateway's refusals, as the client's RefusedError, so both clients fail the same way. */
async function refused<T>(run: () => T | Promise<T>): Promise<T> {
  try {
    return await run();
  } catch (error) {
    if (error instanceof GatewayError) throw new RefusedError(error.reasons);
    throw error;
  }
}

export async function inPageClient(): Promise<GatewayClient> {
  await loadOxigraph();

  const files = Object.keys(ontology).sort((a, b) => (a.endsWith('/platform.ttl') ? -1 : b.endsWith('/platform.ttl') ? 1 : a.localeCompare(b)));
  // Previews are development: signatures are by typed name, recorded as development signatures (platform spec 3.4).
  const gateway = new Gateway(loadGraph([...files.map((f) => ontology[f]), ...Object.values(seed)]), { developmentSignatures: true });
  return {
    people: async () => gateway.people(),
    navigation: async (p) => gateway.navigation(p),
    todo: (p) => gateway.todo(p),
    find: async (p, type) => gateway.find(p, type),
    read: (p, object) => refused(() => gateway.read(p, object)),
    compose: async (p, object, method) => refused(() => gateway.compose(p, object, method)),
    preview: (p, object, method, inputs) => refused(() => gateway.preview(p, object, method, inputs)),
    commit: (p, object, method, inputs, signature) => refused(() => gateway.commit(p, object, method, inputs, signature)),
    methods: (p, object) => refused(() => gateway.methods(p, object)),
    runs: (p, filter) => refused(() => gateway.runs(p, filter)),
    run: (p, run) => refused(() => gateway.run(p, run)),
    notifications: (p) => refused(() => gateway.notifications(p)),
    markRead: (p, notifications) => refused(() => void gateway.markRead(p, notifications)),
  };
}
