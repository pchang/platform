import { useEffect, useState } from 'react';
import type { ViewNode, ViewSpec } from '../design-system/catalog';
import { usePrincipal } from '../principal/PrincipalProvider';
import { ViewRenderer } from '../renderer/Renderer';
import { ComposeDialog } from './ComposeDialog';
import { successNotice } from './composeView';
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
  const [composing, setComposing] = useState<{ object: string; method: string }>();
  const [notice, setNotice] = useState<ViewNode>();
  const [refresh, setRefresh] = useState(0);
  useEffect(() => setNotice(undefined), [principal]);
  const view = useView(async () => buildTodoView(await client.todo(principal), `${name}, ${roleLabel}`, notice), [client, principal, name, roleLabel, notice, refresh]);
  return (
    <>
      <ViewRenderer view={view} host={{ onAction: (action) => setComposing({ object: action.target, method: action.method }) }} />
      {composing && (
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
      )}
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
