import { useEffect, useState } from 'react';
import type { ViewNode, ViewSpec } from '../design-system/catalog';
import type { ToDoItem } from '../data/client';
import { usePrincipal } from '../principal/PrincipalProvider';
import { ViewRenderer } from '../renderer/Renderer';
import { ComposeDialog } from './ComposeDialog';
import { PAGE_ARCHETYPES, successNotice } from './composeView';
import { buildTodoView, buildTypeView, loadingView } from './orientViews';

function useView(load: () => Promise<ViewSpec>, deps: unknown[]): ViewSpec {
  const [view, setView] = useState<ViewSpec>(loadingView);
  useEffect(() => {
    let cancelled = false;
    setView(loadingView);
    load().then((v) => !cancelled && setView(v));
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  return view;
}

/** Orient's To do (platform spec 5.1). Each task runs through its archetype's pattern (platform spec 5.4). */
export function TodoView() {
  const { client, principal, name, roleLabel } = usePrincipal();
  const [items, setItems] = useState<ToDoItem[]>();
  const [composing, setComposing] = useState<{ object: string; method: string; isPage: boolean }>();
  const [notice, setNotice] = useState<ViewNode>();
  const [refresh, setRefresh] = useState(0);
  useEffect(() => setNotice(undefined), [principal]);
  useEffect(() => {
    let cancelled = false;
    setItems(undefined);
    client.todo(principal).then((i) => !cancelled && setItems(i));
    return () => {
      cancelled = true;
    };
  }, [client, principal, refresh]);

  const dialog = composing && (
    <ComposeDialog
      object={composing.object}
      method={composing.method}
      onCancel={() => setComposing(undefined)}
      onDone={(composition, result) => {
        setComposing(undefined);
        setNotice(successNotice(composition, result));
        setRefresh((n) => n + 1);
      }}
    />
  );
  // A page pattern, such as Compare and decide, takes To do's place until it is done or cancelled.
  if (composing?.isPage) return dialog;

  const view = items ? buildTodoView(items, `${name}, ${roleLabel}`, notice) : loadingView;
  return (
    <>
      <ViewRenderer
        view={view}
        host={{
          onAction: (action) => {
            const item = items?.find((i) => i.object.iri === action.target);
            const task = [...(item?.tasks ?? []), ...(item?.actions ?? [])].find((t) => t.method === action.method);
            setComposing({ object: action.target, method: action.method, isPage: PAGE_ARCHETYPES.has(task?.archetype.label ?? '') });
          },
        }}
      />
      {dialog}
    </>
  );
}

/** The objects of one type, from the navigation. */
export function TypeView({ type }: { type: string }) {
  const { client, principal } = usePrincipal();
  const view = useView(async () => {
    const nav = await client.navigation(principal);
    const entry = nav.flatMap((d) => d.types).find((t) => t.type === type);
    return buildTypeView(entry?.pluralLabel ?? type.split('#').pop()!, await client.find(principal, type));
  }, [client, principal, type]);
  return <ViewRenderer view={view} />;
}
