import { useEffect, useState } from 'react';
import type { ViewSpec } from '../design-system/catalog';
import { usePrincipal } from '../principal/PrincipalProvider';
import { ViewRenderer } from '../renderer/Renderer';
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

/** Orient's To do (platform spec 5.1). */
export function TodoView() {
  const { client, principal, name, roleLabel } = usePrincipal();
  const view = useView(async () => buildTodoView(await client.todo(principal), `${name}, ${roleLabel}`), [client, principal, name, roleLabel]);
  return <ViewRenderer view={view} />;
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
