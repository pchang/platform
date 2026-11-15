import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { ViewNode } from '../design-system/catalog';
import { usePrincipal } from '../principal/PrincipalProvider';
import {
  endProcess,
  loadProcesses,
  minimizeProcess,
  openProcess,
  restoreProcess,
  saveProcesses,
  updateProcess,
  type ProcessRecord,
  type ProcessSnapshot,
  type ProcessState,
} from './processes';

/**
 * The person's processes (platform spec 5.4, Several at once; design system spec 4.1): the one in front, the ones set
 * aside in the dock, and the outcome of the last one finished. Kept on this device for each person.
 */

interface ProcessesContext {
  front?: ProcessRecord;
  docked: ProcessRecord[];
  /** Opens a method on an object: the process already set aside for it, or a new one. The front one is set aside. */
  open: (start: Omit<ProcessRecord, 'id' | 'values' | 'progress'>) => void;
  minimize: () => void;
  restore: (id: string) => void;
  /** Ends a process without committing anything. A background run keeps running; an undecided draft stays undecided. */
  close: (id: string, notice?: ViewNode) => void;
  /** Ends a process that committed, with its outcome. */
  finish: (id: string, notice: ViewNode) => void;
  update: (id: string, snapshot: Partial<ProcessSnapshot>) => void;
  /** Reports the outcome of work done outside a process, such as a batch action, so views show it and load again. */
  report: (notice: ViewNode) => void;
  /** The outcome of the last process to finish, for the view to show. */
  notice?: ViewNode;
  /** Goes up each time a process finishes, so views load again. */
  changes: number;
}

const Context = createContext<ProcessesContext | null>(null);
/** How often runs set aside in the dock are asked how they are doing. */
const DOCKED_RUN_POLL_MS = 1000;
let counter = 0;
const newId = () => `${Date.now().toString(36)}-${(counter++).toString(36)}`;

export function ProcessProvider({ children }: { children: ReactNode }) {
  const { client, principal } = usePrincipal();
  const [state, setState] = useState<ProcessState>(() => loadProcesses(principal.person));
  const [notice, setNotice] = useState<ViewNode>();
  const [changes, setChanges] = useState(0);
  const person = useRef(principal.person);

  // Each person has their own processes: switching person puts away one set and brings back the other.
  useEffect(() => {
    if (person.current === principal.person) return;
    person.current = principal.person;
    setState(loadProcesses(principal.person));
    setNotice(undefined);
  }, [principal.person]);
  useEffect(() => saveProcesses(person.current, state), [state]);

  const open = useCallback<ProcessesContext['open']>((start) => {
    setNotice(undefined);
    setState((s) => openProcess(s, start, newId));
  }, []);
  const minimize = useCallback(() => setState(minimizeProcess), []);
  const restore = useCallback((id: string) => setState((s) => restoreProcess(s, id)), []);
  const update = useCallback((id: string, snapshot: Partial<ProcessSnapshot>) => setState((s) => updateProcess(s, id, snapshot)), []);
  const close = useCallback((id: string, closeNotice?: ViewNode) => {
    setState((s) => endProcess(s, id));
    if (closeNotice) {
      setNotice(closeNotice);
      setChanges((c) => c + 1);
    }
  }, []);
  const finish = useCallback((id: string, finishNotice: ViewNode) => {
    setState((s) => endProcess(s, id));
    setNotice(finishNotice);
    setChanges((c) => c + 1);
  }, []);

  const report = useCallback((reportNotice: ViewNode) => {
    setNotice(reportNotice);
    setChanges((c) => c + 1);
  }, []);

  // Runs keep going while their process waits in the dock: follow them so the dock shows how they are doing.
  const dockedRuns = state.docked.filter((p) => p.run && p.progress.status === undefined).map((p) => `${p.id} ${p.run}`).join('|');
  useEffect(() => {
    if (!dockedRuns) return;
    let cancelled = false;
    const poll = () => {
      for (const entry of dockedRuns.split('|')) {
        const [id, run] = entry.split(' ');
        client.run(principal, run).then((r) => {
          if (cancelled) return;
          const progress =
            r.status === 'succeeded'
              ? { fraction: 1, words: 'Finished', status: 'success' as const }
              : r.status === 'failed'
                ? { fraction: 1, words: 'Failed', status: 'danger' as const }
                : r.status === 'queued'
                  ? { fraction: 0, words: 'Waiting to start' }
                  : { fraction: r.progress ?? 0, words: `Running, ${Math.round((r.progress ?? 0) * 100)}%` };
          setState((s) => updateProcess(s, id, { progress }));
        }, () => undefined);
      }
    };
    poll();
    const timer = setInterval(poll, DOCKED_RUN_POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [client, principal, dockedRuns]);

  const value = useMemo(
    () => ({ front: state.front, docked: state.docked, open, minimize, restore, close, finish, update, report, notice, changes }),
    [state, open, minimize, restore, close, finish, update, report, notice, changes],
  );
  return <Context.Provider value={value}>{children}</Context.Provider>;
}

export function useProcesses(): ProcessesContext {
  const value = useContext(Context);
  if (!value) throw new Error('useProcesses must be used inside ProcessProvider');
  return value;
}
