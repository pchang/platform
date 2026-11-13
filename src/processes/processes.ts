/**
 * Several processes at once (platform spec 5.4; design system spec 4.1 and 5.1). A process is one method being run on
 * one object through its archetype's pattern. One is in front; the others wait in the dock with what was given so far.
 * Nothing here commits anything: a process only commits when the person finishes it.
 */

/** How far along a process is, in its archetype's terms (design system spec 5.1). */
export interface Progress {
  /** From 0 to 1; null while the amount of work left is unknown, such as while a model drafts. */
  fraction: number | null;
  /** The progress in words, such as "2 of 3 fields" or "Running, 40%". */
  words: string;
  /** How it ended, or that it cannot go on. Shown with an icon and words, never color alone. */
  status?: 'success' | 'danger';
}

/** What a process keeps while it is set aside. Never a typed signature: signing always starts fresh. */
export interface ProcessSnapshot {
  /** Field values given so far, by field name. */
  values: Record<string, string>;
  /** The background run a Start and track process started. */
  run?: string;
  /** The draft a Review a draft process is deciding on. */
  draft?: string;
  /** Whether the person was editing the draft. */
  editing?: boolean;
  progress: Progress;
}

export interface ProcessRecord extends ProcessSnapshot {
  id: string;
  object: string;
  objectIdentifier: string;
  method: string;
  /** The method's label, such as Triage. */
  label: string;
  /** The method's interaction archetype, such as Fill in. */
  archetype: string;
}

export interface ProcessState {
  /** The process in front, if any. */
  front?: ProcessRecord;
  /** Processes set aside, oldest first. */
  docked: ProcessRecord[];
}

/** The fields never kept for a set-aside process. */
export const NEVER_KEPT = new Set(['signatureName']);

export const NOT_STARTED: Progress = { fraction: 0, words: 'Not started' };

export const processTitle = (p: Pick<ProcessRecord, 'label' | 'objectIdentifier'>) => `${p.label} ${p.objectIdentifier}`;

// ---------------------------------------------------------------- state changes

/** Opens a process for an object and method: the one already set aside for it, or a new one. The front one is set aside. */
export function openProcess(state: ProcessState, start: Omit<ProcessRecord, 'id' | 'values' | 'progress'>, newId: () => string): ProcessState {
  if (state.front && state.front.object === start.object && state.front.method === start.method) return state;
  const existing = state.docked.find((p) => p.object === start.object && p.method === start.method);
  if (existing) return restoreProcess(state, existing.id);
  const docked = state.front ? [...state.docked, state.front] : state.docked;
  return { front: { ...start, id: newId(), values: {}, progress: NOT_STARTED }, docked };
}

/** Sets the front process aside in the dock. */
export function minimizeProcess(state: ProcessState): ProcessState {
  if (!state.front) return state;
  return { docked: [...state.docked, state.front] };
}

/** Brings a set-aside process to the front; the front one takes its place in the dock. */
export function restoreProcess(state: ProcessState, id: string): ProcessState {
  const target = state.docked.find((p) => p.id === id);
  if (!target) return state;
  const docked = state.docked.filter((p) => p.id !== id);
  return { front: target, docked: state.front ? [...docked, state.front] : docked };
}

/** Ends a process, in front or set aside: finished, or closed without committing. */
export function endProcess(state: ProcessState, id: string): ProcessState {
  return { front: state.front?.id === id ? undefined : state.front, docked: state.docked.filter((p) => p.id !== id) };
}

/** Keeps what a process has given so far. */
export function updateProcess(state: ProcessState, id: string, snapshot: Partial<ProcessSnapshot>): ProcessState {
  const values = snapshot.values && Object.fromEntries(Object.entries(snapshot.values).filter(([k]) => !NEVER_KEPT.has(k)));
  const apply = (p: ProcessRecord) => (p.id === id ? { ...p, ...snapshot, ...(values ? { values } : {}) } : p);
  return { front: state.front && apply(state.front), docked: state.docked.map(apply) };
}

// ---------------------------------------------------------------- kept on the device

const storageKey = (person: string) => `lsh.processes.${person}`;

/**
 * The person's processes, kept on this device until each is finished or closed (design system spec 4.1). Whatever was
 * in front when the page closed comes back in the dock, so a reload never opens something over the page.
 */
export function loadProcesses(person: string, storage: Pick<Storage, 'getItem'> | undefined = globalThis.localStorage): ProcessState {
  try {
    const saved = JSON.parse(storage?.getItem(storageKey(person)) ?? 'null') as ProcessState | null;
    if (!saved || !Array.isArray(saved.docked)) return { docked: [] };
    const all = [...saved.docked, ...(saved.front ? [saved.front] : [])].filter(isRecord);
    return { docked: all.map((p) => ({ ...p, values: Object.fromEntries(Object.entries(p.values).filter(([k]) => !NEVER_KEPT.has(k))) })) };
  } catch {
    return { docked: [] };
  }
}

export function saveProcesses(person: string, state: ProcessState, storage: Pick<Storage, 'setItem' | 'removeItem'> | undefined = globalThis.localStorage): void {
  try {
    if (!state.front && !state.docked.length) storage?.removeItem(storageKey(person));
    else storage?.setItem(storageKey(person), JSON.stringify(state));
  } catch {
    // Not kept on this device; the processes still work until the page closes.
  }
}

function isRecord(value: unknown): value is ProcessRecord {
  const p = value as ProcessRecord;
  return Boolean(p && typeof p.id === 'string' && typeof p.object === 'string' && typeof p.method === 'string' && typeof p.label === 'string' && p.values && p.progress);
}
