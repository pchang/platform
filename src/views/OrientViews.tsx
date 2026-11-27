import { useEffect, useMemo, useState } from 'react';
import type { RenderHost } from '../renderer/Renderer';
import type { ViewNode, ViewSpec } from '../design-system/catalog';
import type { AskResult, HomeView, MethodOption, ObjectSummary, RunView, ToDoItem } from '../data/client';
import { useNotifications } from '../notifications/NotificationsProvider';
import { useChat } from '../chat/ChatProvider';
import { useObjectPanel } from '../objects/ObjectPanelProvider';
import { usePrincipal } from '../principal/PrincipalProvider';
import { useProcesses } from '../processes/ProcessProvider';
import { ViewRenderer } from '../renderer/Renderer';
import { BatchDialog } from './BatchDialog';
import { SetDialog } from './SetDialog';
import { ObjectFormDialog, type FormTarget } from './ObjectFormDialog';
import { answeringView, buildAnswerView, buildSearchView, buildTodoView, buildTypeView, LIST_MODE_FIELD, loadingView, matchesFilter, objectEntries, objectList, TODO_FILTER_FIELD, type ListControls, type ListMode, type TodoFilter } from './orientView';
import { backToHome, metricPage } from './homeView';
import { sections } from './layout';
import { RefusedError } from '../data/client';
import { routeHref } from '../routing';

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
export function useObjectList(listed: ObjectSummary[]) {
  const processes = useProcesses();
  const [mode, setMode] = useState<ListMode>(loadListMode);
  const [selecting, setSelecting] = useState(false);
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
  const [batch, setBatch] = useState<{ method: string; objects: ObjectSummary[] }>();
  const [form, setForm] = useState<FormTarget>();
  const key = listed.map((o) => o.iri).join('|');
  useEffect(() => {
    const present = new Set(key.split('|'));
    setSelected((s) => {
      const kept = [...s].filter((o) => present.has(o));
      return kept.length === s.size ? s : new Set(kept);
    });
  }, [key]);

  // The set methods the chosen objects qualify for together, asked of the gateway as the choice changes (platform spec 5.4).
  const { client, principal } = usePrincipal();
  const [setActions, setSetActions] = useState<{ method: string; label: string }[]>([]);
  const selectedKey = [...selected].sort().join('|');
  useEffect(() => {
    const ids = selectedKey ? selectedKey.split('|') : [];
    if (ids.length < 2) {
      setSetActions([]);
      return;
    }
    let cancelled = false;
    client.setMethods(principal, ids).then(
      (methods) => !cancelled && setSetActions(methods.map((m) => ({ method: m.method, label: m.label }))),
      () => !cancelled && setSetActions([]),
    );
    return () => {
      cancelled = true;
    };
  }, [client, principal, selectedKey]);

  // Cards with something chosen are in select mode, so the choice shows; Done ends it and clears the choice.
  const controls: ListControls = useMemo(
    () => ({ mode, selecting: mode === 'cards' && (selecting || selected.size > 0), selected, setActions }),
    [mode, selecting, selected, setActions],
  );
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
    // A type's name links to that type's list (design system spec 4.3, Type links).
    typeHref: (type) => routeHref({ name: 'type', type }),
    // Creating and editing (platform spec 5.3): New and Add in the list bar, Edit in the object panel's header.
    onCreate: (type, within) => setForm({ mode: 'create', type, ...(within ? { within } : {}) }),
    onEdit: (object) => setForm({ mode: 'edit', object }),
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
  const done = (notice: ViewNode) => {
    setBatch(undefined);
    setSelected(new Set());
    setSelecting(false);
    processes.report(notice);
  };
  const isSet = batch && setActions.some((m) => m.method === batch.method);
  const formDialog = form && (
    <ObjectFormDialog
      target={form}
      onCancel={() => setForm(undefined)}
      onDone={(notice) => {
        setForm(undefined);
        processes.report(notice);
      }}
    />
  );
  const dialog = batch && isSet ? (
    <SetDialog objects={batch.objects} method={batch.method} onCancel={() => setBatch(undefined)} onDone={done} />
  ) : batch && (
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
  return { controls, host, onIntent, onField, dialog: (<>{dialog}{formDialog}</>), values: { [LIST_MODE_FIELD]: mode } };
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
  const chat = useChat();
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
  const [home, setHome] = useState<HomeView>();
  const runs = useActiveRuns([processes.changes, changes]);
  useEffect(() => {
    let cancelled = false;
    setItems(undefined);
    // Home: To do, and the person's world and keeping up beside it (platform spec 5.1, Home).
    Promise.all([client.todo(principal), client.home(principal)]).then(([i, h]) => {
      if (cancelled) return;
      setHome(h);
      setItems(i);
    });
    return () => {
      cancelled = true;
    };
  }, [client, principal, processes.changes, changes]);

  const today = useMemo(() => new Date(), [items]);
  const shown = useMemo(() => (items ?? []).filter((i) => matchesFilter(i, filter, today)).map((i) => i.object), [items, filter, today]);
  const list = useObjectList(shown);
  const view = items ? buildTodoView(items, { name, role: roleLabel }, processes.notice, runs, { filter, today, controls: list.controls, ...(home ? { home } : {}) }) : loadingView;
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
          onOpen: panel.open, onAsk: chat.askAbout,
          // A metric tile links to its objects' own page (platform spec 5.1, Home).
          metricHref: (metric) => routeHref({ name: 'metric', metric }),
          // A Where things stand row links to its type's list (design system spec 4.3, Home).
          typeHref: (type) => routeHref({ name: 'type', type }),
        }}
      />
      {list.dialog}
    </>
  );
}

/** A metric's objects, on a page of their own (platform spec 5.1, Home, From a metric to its objects). */
export function MetricView({ metric }: { metric: string }) {
  const panel = useObjectPanel();
  const chat = useChat();
  const { client, principal } = usePrincipal();
  const { changes } = useNotifications();
  const processes = useProcesses();
  const [loaded, setLoaded] = useState<{ metric: HomeView['metrics'][number]; objects: ObjectSummary[]; methods: Map<string, MethodOption[]> }>();
  const [refused, setRefused] = useState<string[]>();
  const openMethod = useOpenMethod((object, method) => {
    const summary = loaded?.objects.find((o) => o.iri === object);
    const option = loaded?.methods.get(object)?.find((m) => m.method === method);
    return summary && option && { object: summary, method: option };
  });
  const runs = useActiveRuns([metric, processes.changes, changes]);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const found = await client.metricObjects(principal, metric);
        const methods = new Map(await Promise.all(found.objects.map(async (o) => [o.iri, await client.methods(principal, o.iri)] as const)));
        if (!cancelled) setLoaded({ ...found, methods });
      } catch (error) {
        if (!cancelled) setRefused(error instanceof RefusedError ? error.reasons : [String(error)]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [client, principal, metric, processes.changes, changes]);

  const list = useObjectList(loaded?.objects ?? NONE);
  const view: ViewSpec = refused
    ? {
        pattern: 'card-view',
        because: 'The gateway refused to show the metric',
        // Even when the metric cannot be shown, the way back is there.
        root: sections([
          backToHome,
          { component: 'Alert', props: { variant: 'danger', title: 'This metric cannot be shown', isInline: true }, children: refused.map((r) => ({ component: 'Content', props: { label: r } })) },
        ]),
      }
    : loaded
      ? metricPage(loaded.metric, objectList(objectEntries(loaded.objects, { methods: loaded.methods, runs }), list.controls, loaded.metric.label), processes.notice)
      : loadingView;
  return (
    <>
      <ViewRenderer
        view={view}
        host={{ ...list.host, values: list.values, onField: list.onField, onIntent: list.onIntent, onAction: (action) => openMethod(action.target, action.method), onOpen: panel.open, onAsk: chat.askAbout, homeHref: routeHref({ name: 'todo' }) }}
      />
      {list.dialog}
    </>
  );
}

/** The objects of one type, from the navigation, each with the methods the person can run on it now (design system spec 4.3). */
export function TypeView({ type }: { type: string }) {
  const panel = useObjectPanel();
  const chat = useChat();
  const { client, principal } = usePrincipal();
  const { changes } = useNotifications();
  const [loaded, setLoaded] = useState<{ label: string; pluralLabel: string; objects: ObjectSummary[]; methods: Map<string, MethodOption[]>; create?: { type: string; typeLabel: string; verb: 'New' } }>();
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
      const create = entry?.creatable ? { type, typeLabel: entry.label, verb: 'New' as const } : undefined;
      // The type's own names, from the ontology, even when it is not in the person's navigation, such as a type reached by a link.
      const names = entry ? { label: entry.label, pluralLabel: entry.pluralLabel } : objects[0] ? { label: objects[0].typeLabel, pluralLabel: objects[0].pluralLabel } : await client.describeType(principal, type);
      if (!cancelled) setLoaded({ label: names.label, pluralLabel: names.pluralLabel, objects, methods, ...(create ? { create } : {}) });
    })();
    return () => {
      cancelled = true;
    };
  }, [client, principal, type, processes.changes, changes]);

  const list = useObjectList(loaded?.objects ?? NONE);
  // New, when the person may create objects of the type (platform spec 5.3).
  const create = loaded?.create;
  const view = loaded
    ? buildTypeView(loaded.pluralLabel, loaded.objects, { label: loaded.label, methods: loaded.methods, runs, notice: processes.notice, controls: { ...list.controls, ...(create ? { create } : {}) } })
    : loadingView;
  return (
    <>
      <ViewRenderer
        view={view}
        host={{ ...list.host, values: list.values, onField: list.onField, onIntent: list.onIntent, onAction: (action) => openMethod(action.target, action.method), onOpen: panel.open, onAsk: chat.askAbout, homeHref: routeHref({ name: 'todo' }) }}
      />
      {list.dialog}
    </>
  );
}

/**
 * The search page (design system spec 4.1, Search): a model's answer and the objects it rests on, or, without one, the
 * gateway's understanding of the query and what it found (platform spec 5.2).
 */
export function SearchView({ query }: { query: string }) {
  const panel = useObjectPanel();
  const chat = useChat();
  const { client, principal } = usePrincipal();
  const { changes } = useNotifications();
  const [loaded, setLoaded] = useState<{ result: AskResult; objects: ObjectSummary[]; methods: Map<string, MethodOption[]> }>();
  const processes = useProcesses();
  const openMethod = useOpenMethod((object, method) => {
    const found = loaded?.objects.find((o) => o.iri === object);
    const option = loaded?.methods.get(object)?.find((m) => m.method === method);
    return found && option && { object: found, method: option };
  });
  const runs = useActiveRuns([query, processes.changes, changes]);
  useEffect(() => {
    let cancelled = false;
    setLoaded(undefined);
    (async () => {
      const result = await client.ask(principal, query);
      const objects = result.answer ? result.answer.cited : (result.search?.results.map((r) => r.object) ?? []);
      const methods = new Map(await Promise.all(objects.map(async (o) => [o.iri, await client.methods(principal, o.iri)] as const)));
      if (!cancelled) setLoaded({ result, objects, methods });
    })();
    return () => {
      cancelled = true;
    };
  }, [client, principal, query, processes.changes, changes]);

  const list = useObjectList(loaded?.objects ?? NONE);
  const options = { methods: loaded?.methods, runs, notice: processes.notice, controls: list.controls };
  const result = loaded?.result;
  const view = !result
    ? answeringView(query)
    : result.answer
      ? buildAnswerView({ ...result, answer: result.answer }, options)
      : buildSearchView(result.search!, { ...options, ...(result.searched ? { searched: result.searched } : {}) });
  return (
    <>
      <ViewRenderer
        view={view}
        host={{ ...list.host, values: list.values, onField: list.onField, onIntent: list.onIntent, onAction: (action) => openMethod(action.target, action.method), onOpen: panel.open, onAsk: chat.askAbout }}
      />
      {list.dialog}
    </>
  );
}
