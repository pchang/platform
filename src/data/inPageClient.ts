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
    me: async () => ({ mode: 'preview' as const }),
    search: (p, query, options) => gateway.search(p, query, options),
    // The page holds no credential, so no model is connected here: questions are searched (platform spec 5.2).
    ask: (p, question, earlier, about) => gateway.ask(p, question, earlier, about),
    find: async (p, type) => gateway.find(p, type),
    read: (p, object) => refused(() => gateway.read(p, object)),
    compose: async (p, object, method) => refused(() => gateway.compose(p, object, method)),
    preview: (p, object, method, inputs) => refused(() => gateway.preview(p, object, method, inputs)),
    commit: (p, object, method, inputs, signature, draft, proposal) => refused(() => gateway.commit(p, object, method, inputs, signature, draft, proposal)),
    propose: (p, objects, method) => refused(() => gateway.propose(p, objects, method)),
    // No model is ever connected in a preview: a key cannot live in a page. The gateway says so.
    draft: (p, object, method) => refused(() => gateway.draft(p, object, method)),
    discardDraft: (p, draft) => refused(() => gateway.discardDraft(p, draft)),
    getDraft: (p, draft) => refused(() => gateway.getDraft(p, draft)),
    methods: (p, object) => refused(() => gateway.methods(p, object)),
    createForm: (p, type, parent) => refused(() => gateway.createForm(p, type, parent)),
    describeType: async (p, type) => refused(() => gateway.describeType(p, type)),
    previewCreate: (p, type, values, parent) => refused(() => gateway.previewCreate(p, type, values, parent)),
    create: (p, type, values, parent) => refused(() => gateway.create(p, type, values, parent)),
    editBlocks: (p, object) => refused(() => gateway.editBlocks(p, object)),
    editForm: (p, object) => refused(() => gateway.editForm(p, object)),
    previewEdit: (p, object, values) => refused(() => gateway.previewEdit(p, object, values)),
    edit: (p, object, values) => refused(() => gateway.edit(p, object, values)),
    home: async (p) => refused(() => gateway.home(p)),
    metricObjects: async (p, metric) => refused(() => gateway.metricObjects(p, metric)),
    setMethods: (p, objects) => refused(() => gateway.setMethods(p, objects)),
    composeSet: (p, objects, method) => refused(() => gateway.composeSet(p, objects, method)),
    previewSet: (p, objects, method, inputs) => refused(() => gateway.previewSet(p, objects, method, inputs)),
    commitSet: (p, objects, method, inputs, proposal) => refused(() => gateway.commitSet(p, objects, method, inputs, proposal)),
    runs: (p, filter) => refused(() => gateway.runs(p, filter)),
    run: (p, run) => refused(() => gateway.run(p, run)),
    notifications: (p) => refused(() => gateway.notifications(p)),
    markRead: (p, notifications) => refused(() => void gateway.markRead(p, notifications)),
  };
}
