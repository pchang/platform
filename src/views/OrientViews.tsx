import { useEffect, useMemo, useState } from 'react';
import type { RenderHost } from '../renderer/Renderer';
import type { MethodOption, ObjectSummary, RunView, SearchResult, ToDoItem } from '../data/client';
import { useNotifications } from '../notifications/NotificationsProvider';
import { useObjectPanel } from '../objects/ObjectPanelProvider';
import { usePrincipal } from '../principal/PrincipalProvider';
import { useProcesses } from '../processes/ProcessProvider';
import { ViewRenderer } from '../renderer/Renderer';
import { BatchDialog } from './BatchDialog';
import { buildSearchView, buildTodoView, buildTypeView, LIST_MODE_FIELD, loadingView, matchesFilter, TODO_FILTER_FIELD, type ListControls, type ListMode, type TodoFilter } from './orientViews';

/** Cards or a list: the person's choice, kept on the device for every object list (design system spec 4.3). */
const LIST_MODE_KEY = 'lsh.listMode';
function loadListMode(): ListMode {
  try {
    return localStorage.getItem(LIST_MODE_KEY) === 'list' ? 'list' : 'cards';
  } catch {
    return 'cards';
  }
}

/**
 * How an object list is shown and what is chosen in it (design system spec 4.3), and batch actions on the chosen
 * objects. Objects no longer listed are no longer chosen.
 */
function useObjectList(listed: ObjectSummary[]) {
  const processes = useProcesses();
  const [mode, setMode] = useState<ListMode>(loadListMode);
  const [selecting, setSelecting] = useState(false);
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
  const [batch, setBatch] = useState<{ method: string; objects: ObjectSummary[] }>();
  const key = listed.map((o) => o.iri).join('|');
  useEffect(() => {
    const present = new Set(key.split('|'));
    setSelected((s) => {
      const kept = [...s].filter((o) => present.has(o));
      return kept.length === s.size ? s : new Set(kept);
    });
  }, [key]);

  // Cards with something chosen are in select mode, so the choice shows; Done ends it and clears the choice.
  const controls: ListControls = useMemo(() => ({ mode, selecting: mode === 'cards' && (selecting || selected.size > 0), selected }), [mode, selecting, selected]);
  const host: RenderHost = {
    selection: {
      selecting: controls.selecting,
      selected,
      onSelect: (object, chosen) =>
        setSelected((s) => {
          const next = new Set(s);
          if (chosen) next.add(object);
          else next.delete(object);
          return next;
        }),
    },
    onBatch: (method) => setBatch({ method, objects: listed.filter((o) => selected.has(o.iri)) }),
  };
  const onIntent = (intent: string) => {
    if (intent === 'select') {
      if (controls.selecting) setSelected(new Set());
      setSelecting(!controls.selecting);
    }
    if (intent === 'select-all') setSelected(new Set(listed.map((o) => o.iri)));
    if (intent === 'clear-selection') setSelected(new Set());
  };
  const onField = (field: string, value: string) => {
    if (field !== LIST_MODE_FIELD) return false;
    setMode(value as ListMode);
    try {
      localStorage.setItem(LIST_MODE_KEY, value);
    } catch {
      // Not kept on this device; the choice still applies until the page closes.
    }
    return true;
  };
  const dialog = batch && (
    <BatchDialog
      objects={batch.objects}
      method={batch.method}
      onCancel={() => setBatch(undefined)}
      onDone={(notice) => {
        setBatch(undefined);
        setSelected(new Set());
        setSelecting(false);
        processes.report(notice);
      }}
    />
  );
  return { controls, host, onIntent, onField, dialog, values: { [LIST_MODE_FIELD]: mode } };
}

const NONE: ObjectSummary[] = [];

/** A method to run from a card: its label and archetype, as the view knows them. */
type Runnable = { method: string; label: string; archetype: { label: string } };

/**
 * Running a method from a card opens it as a process (platform spec 5.4): the process in front, if any, is set aside,
 * and the outcome comes back to whichever view is showing. Shared by To do and object lists.
 */
export function useOpenMethod(find: (object: string, method: string) => { object: ObjectSummary; method: Runnable } | undefined) {
  const { open } = useProcesses();
  return (object: string, method: string) => {
    const found = find(object, method);
    if (!found) return;
    open({
      object,
      objectIdentifier: found.object.identifier,
      method,
      label: found.method.label,
      archetype: found.method.archetype.label,
    });
  };
}

/** Runs that have not ended, so cards can show them (design system spec 4.3). Asked again while any is running. */
export function useActiveRuns(deps: unknown[]): RunView[] {
  const { client, principal } = usePrincipal();
  const [runs, setRuns] = useState<RunView[]>([]);
  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const load = () =>
      client.runs(principal, { active: true }).then(
        (r) => {
          if (cancelled) return;
          setRuns(r);
          if (r.length) timer = setTimeout(load, 1000);
        },
        () => undefined,
      );
    void load();
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [client, principal, ...deps]);
  return runs;
}

/** Orient's To do (platform spec 5.1). Each task runs through its archetype's pattern (platform spec 5.4). */
export function TodoView() {
  const panel = useObjectPanel();
  const { client, principal, name, roleLabel } = usePrincipal();
  const { changes } = useNotifications();
  const [items, setItems] = useState<ToDoItem[]>();
  // The count tiles narrow the cards (design system spec 4.3). A new person starts with every item.
  const [filter, setFilter] = useState<TodoFilter>('all');
  useEffect(() => setFilter('all'), [principal]);
  const processes = useProcesses();
  const openMethod = useOpenMethod((object, method) => {
    const item = items?.find((i) => i.object.iri === object);
    const task = [...(item?.tasks ?? []), ...(item?.actions ?? [])].find((t) => t.method === method);
    return item && task && { object: item.object, method: task };
  });
  const runs = useActiveRuns([processes.changes, changes]);
  useEffect(() => {
    let cancelled = false;
    setItems(undefined);
    client.todo(principal).then((i) => !cancelled && setItems(i));
    return () => {
      cancelled = true;
    };
  }, [client, principal, processes.changes, changes]);

  const today = useMemo(() => new Date(), [items]);
  const shown = useMemo(() => (items ?? []).filter((i) => matchesFilter(i, filter, today)).map((i) => i.object), [items, filter, today]);
  const list = useObjectList(shown);
  const view = items ? buildTodoView(items, `${name}, ${roleLabel}`, processes.notice, runs, { filter, today, controls: list.controls }) : loadingView;
  return (
    <>
      <ViewRenderer
        view={view}
        host={{
          ...list.host,
          values: { [TODO_FILTER_FIELD]: filter, ...list.values },
          onField: (field, value) => list.onField(field, value) || (field === TODO_FILTER_FIELD && setFilter(value as TodoFilter)),
          onIntent: list.onIntent,
          onAction: (action) => openMethod(action.target, action.method),
          onOpen: panel.open,
        }}
      />
      {list.dialog}
    </>
  );
}

/** The objects of one type, from the navigation, each with the methods the person can run on it now (design system spec 4.3). */
export function TypeView({ type }: { type: string }) {
  const panel = useObjectPanel();
  const { client, principal } = usePrincipal();
  const { changes } = useNotifications();
  const [loaded, setLoaded] = useState<{ pluralLabel: string; objects: ObjectSummary[]; methods: Map<string, MethodOption[]> }>();
  const processes = useProcesses();
  const openMethod = useOpenMethod((object, method) => {
    const summary = loaded?.objects.find((o) => o.iri === object);
    const option = loaded?.methods.get(object)?.find((m) => m.method === method);
    return summary && option && { object: summary, method: option };
  });
  const runs = useActiveRuns([type, processes.changes, changes]);
  useEffect(() => {
    let cancelled = false;
    setLoaded(undefined);
    (async () => {
      const nav = await client.navigation(principal);
      const entry = nav.flatMap((d) => d.types).find((t) => t.type === type);
      const objects = await client.find(principal, type);
      const methods = new Map(await Promise.all(objects.map(async (o) => [o.iri, await client.methods(principal, o.iri)] as const)));
      if (!cancelled) setLoaded({ pluralLabel: entry?.pluralLabel ?? type.split('#').pop()!, objects, methods });
    })();
    return () => {
      cancelled = true;
    };
  }, [client, principal, type, processes.changes, changes]);

  const list = useObjectList(loaded?.objects ?? NONE);
  const view = loaded ? buildTypeView(loaded.pluralLabel, loaded.objects, { methods: loaded.methods, runs, notice: processes.notice, controls: list.controls }) : loadingView;
  return (
    <>
      <ViewRenderer
        view={view}
        host={{ ...list.host, values: list.values, onField: list.onField, onIntent: list.onIntent, onAction: (action) => openMethod(action.target, action.method), onOpen: panel.open }}
      />
      {list.dialog}
    </>
  );
}

/** The search page (design system spec 4.1, Search): the gateway's understanding of the query, and what it found. */
export function SearchView({ query }: { query: string }) {
  const panel = useObjectPanel();
  const { client, principal } = usePrincipal();
  const { changes } = useNotifications();
  const [loaded, setLoaded] = useState<{ result: SearchResult; methods: Map<string, MethodOption[]> }>();
  const processes = useProcesses();
  const openMethod = useOpenMethod((object, method) => {
    const found = loaded?.result.results.find((r) => r.object.iri === object);
    const option = loaded?.methods.get(object)?.find((m) => m.method === method);
    return found && option && { object: found.object, method: option };
  });
  const runs = useActiveRuns([query, processes.changes, changes]);
  useEffect(() => {
    let cancelled = false;
    setLoaded(undefined);
    (async () => {
      const result = await client.search(principal, query);
      const methods = new Map(await Promise.all(result.results.map(async (r) => [r.object.iri, await client.methods(principal, r.object.iri)] as const)));
      if (!cancelled) setLoaded({ result, methods });
    })();
    return () => {
      cancelled = true;
    };
  }, [client, principal, query, processes.changes, changes]);

  const found = useMemo(() => loaded?.result.results.map((r) => r.object) ?? NONE, [loaded]);
  const list = useObjectList(found);
  const view = loaded ? buildSearchView(loaded.result, { methods: loaded.methods, runs, notice: processes.notice, controls: list.controls }) : loadingView;
  return (
    <>
      <ViewRenderer
        view={view}
        host={{ ...list.host, values: list.values, onField: list.onField, onIntent: list.onIntent, onAction: (action) => openMethod(action.target, action.method), onOpen: panel.open }}
      />
      {list.dialog}
    </>
  );
}
