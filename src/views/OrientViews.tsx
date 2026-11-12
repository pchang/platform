import { useEffect, useState } from 'react';
import type { ViewNode } from '../design-system/catalog';
import type { MethodOption, ObjectSummary, RunView, ToDoItem } from '../data/client';
import { useNotifications } from '../notifications/NotificationsProvider';
import { usePrincipal } from '../principal/PrincipalProvider';
import { ViewRenderer } from '../renderer/Renderer';
import { ComposeDialog } from './ComposeDialog';
import { PAGE_ARCHETYPES, successNotice } from './composeView';
import { buildTodoView, buildTypeView, loadingView } from './orientViews';

/**
 * Running a method from a card (platform spec 5.4): the method's pattern, then the outcome as a notice, and the
 * view loads again. Shared by To do and object lists, so a method runs the same way from either.
 */
function useCompose(archetypeOf: (object: string, method: string) => string | undefined) {
  const { principal } = usePrincipal();
  const { refresh: refreshNotifications } = useNotifications();
  const [composing, setComposing] = useState<{ object: string; method: string; isPage: boolean }>();
  const [notice, setNotice] = useState<ViewNode>();
  const [done, setDone] = useState(0);
  useEffect(() => setNotice(undefined), [principal]);

  const dialog = composing && (
    <ComposeDialog
      object={composing.object}
      method={composing.method}
      onCancel={() => setComposing(undefined)}
      onDone={(composition, result) => {
        setComposing(undefined);
        setNotice(successNotice(composition, result));
        setDone((n) => n + 1);
        if (result.run) refreshNotifications();
      }}
    />
  );
  const open = (object: string, method: string) => setComposing({ object, method, isPage: PAGE_ARCHETYPES.has(archetypeOf(object, method) ?? '') });
  return { dialog, isPage: Boolean(composing?.isPage), notice, done, open };
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
  const compose = useCompose((object, method) => {
    const item = items?.find((i) => i.object.iri === object);
    return [...(item?.tasks ?? []), ...(item?.actions ?? [])].find((t) => t.method === method)?.archetype.label;
  });
  const runs = useActiveRuns([compose.done, changes]);
  useEffect(() => {
    let cancelled = false;
    setItems(undefined);
    client.todo(principal).then((i) => !cancelled && setItems(i));
    return () => {
      cancelled = true;
    };
  }, [client, principal, compose.done, changes]);

  // A page pattern, such as Compare and decide, takes To do's place until it is done or cancelled.
  if (compose.isPage) return compose.dialog;
  const view = items ? buildTodoView(items, `${name}, ${roleLabel}`, compose.notice, runs) : loadingView;
  return (
    <>
      <ViewRenderer view={view} host={{ onAction: (action) => compose.open(action.target, action.method) }} />
      {compose.dialog}
    </>
  );
}

/** The objects of one type, from the navigation, each with the methods the person can run on it now (design system spec 4.3). */
export function TypeView({ type }: { type: string }) {
  const { client, principal } = usePrincipal();
  const { changes } = useNotifications();
  const [loaded, setLoaded] = useState<{ pluralLabel: string; objects: ObjectSummary[]; methods: Map<string, MethodOption[]> }>();
  const compose = useCompose((object, method) => loaded?.methods.get(object)?.find((m) => m.method === method)?.archetype.label);
  const runs = useActiveRuns([type, compose.done, changes]);
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
  }, [client, principal, type, compose.done, changes]);

  if (compose.isPage) return compose.dialog;
  const view = loaded ? buildTypeView(loaded.pluralLabel, loaded.objects, { methods: loaded.methods, runs, notice: compose.notice }) : loadingView;
  return (
    <>
      <ViewRenderer view={view} host={{ onAction: (action) => compose.open(action.target, action.method) }} />
      {compose.dialog}
    </>
  );
}
