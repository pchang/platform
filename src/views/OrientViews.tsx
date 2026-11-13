import { useEffect, useState } from 'react';
import type { MethodOption, ObjectSummary, RunView, SearchResult, ToDoItem } from '../data/client';
import { useNotifications } from '../notifications/NotificationsProvider';
import { usePrincipal } from '../principal/PrincipalProvider';
import { useProcesses } from '../processes/ProcessProvider';
import { ViewRenderer } from '../renderer/Renderer';
import { buildSearchView, buildTodoView, buildTypeView, loadingView, TODO_FILTER_FIELD, type TodoFilter } from './orientViews';

/** A method to run from a card: its label and archetype, as the view knows them. */
type Runnable = { method: string; label: string; archetype: { label: string } };

/**
 * Running a method from a card opens it as a process (platform spec 5.4): the process in front, if any, is set aside,
 * and the outcome comes back to whichever view is showing. Shared by To do and object lists.
 */
function useOpenMethod(find: (object: string, method: string) => { object: ObjectSummary; method: Runnable } | undefined) {
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
function useActiveRuns(deps: unknown[]): RunView[] {
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

  const view = items ? buildTodoView(items, `${name}, ${roleLabel}`, processes.notice, runs, { filter }) : loadingView;
  return (
    <ViewRenderer
      view={view}
      host={{
        values: { [TODO_FILTER_FIELD]: filter },
        onField: (field, value) => field === TODO_FILTER_FIELD && setFilter(value as TodoFilter),
        onAction: (action) => openMethod(action.target, action.method),
      }}
    />
  );
}

/** The objects of one type, from the navigation, each with the methods the person can run on it now (design system spec 4.3). */
export function TypeView({ type }: { type: string }) {
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

  const view = loaded ? buildTypeView(loaded.pluralLabel, loaded.objects, { methods: loaded.methods, runs, notice: processes.notice }) : loadingView;
  return <ViewRenderer view={view} host={{ onAction: (action) => openMethod(action.target, action.method) }} />;
}

/** The search page (design system spec 4.1, Search): the gateway's understanding of the query, and what it found. */
export function SearchView({ query }: { query: string }) {
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

  const view = loaded ? buildSearchView(loaded.result, { methods: loaded.methods, runs, notice: processes.notice }) : loadingView;
  return <ViewRenderer view={view} host={{ onAction: (action) => openMethod(action.target, action.method) }} />;
}
