import { useEffect, useState } from 'react';
import { useChat } from '../chat/ChatProvider';
import { RefusedError, type GlanceList, type GlanceView as Glance, type MethodOption, type ObjectSummary } from '../data/client';
import { useNotifications } from '../notifications/NotificationsProvider';
import { useObjectPanel } from '../objects/ObjectPanelProvider';
import { usePrincipal } from '../principal/PrincipalProvider';
import { useProcesses } from '../processes/ProcessProvider';
import { ViewRenderer } from '../renderer/Renderer';
import { buildGlanceListView, buildGlanceView } from './glanceView';
import { useGlanceList } from './landing';
import { loadingView } from './orientView';
import { useActiveRuns, useObjectList, useOpenMethod } from './OrientViews';

const NONE: ObjectSummary[] = [];

/**
 * At a glance (platform spec 5.1; design system spec 4.5). With an initiative named, that initiative seen whole.
 * Without one, the initiatives the person may read: with one, it opens on it; with several, they choose.
 */
export function GlanceView({ initiative }: { initiative?: string }) {
  const list = useGlanceList();
  if (initiative) return <InitiativeView key={initiative} initiative={initiative} />;
  if (!list) return <ViewRenderer view={loadingView} host={{}} />;
  if (list.initiatives.length === 1) return <InitiativeView key={list.initiatives[0].iri} initiative={list.initiatives[0].iri} />;
  return <InitiativeList list={list} />;
}

/** One initiative seen whole, read again after every commit and notification, so it moves with the work. */
function InitiativeView({ initiative }: { initiative: string }) {
  const panel = useObjectPanel();
  const chat = useChat();
  const { client, principal } = usePrincipal();
  const { changes } = useNotifications();
  const processes = useProcesses();
  const [loaded, setLoaded] = useState<{ view: Glance; methods: Map<string, MethodOption[]> }>();
  const [refused, setRefused] = useState<string[]>();
  const runs = useActiveRuns([initiative, processes.changes, changes]);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const view = await client.glance(principal, initiative);
        const methods = new Map(await Promise.all(view.attention.map(async (a) => [a.object.iri, await client.methods(principal, a.object.iri)] as const)));
        if (!cancelled) setLoaded({ view, methods });
      } catch (error) {
        if (!cancelled) setRefused(error instanceof RefusedError ? error.reasons : [String(error)]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [client, principal, initiative, processes.changes, changes]);

  const objects = loaded?.view.attention.map((a) => a.object) ?? NONE;
  const list = useObjectList(objects);
  const openMethod = useOpenMethod((object, method) => {
    const summary = objects.find((o) => o.iri === object);
    const option = loaded?.methods.get(object)?.find((m) => m.method === method);
    return summary && option && { object: summary, method: option };
  });
  const view = refused
    ? {
        pattern: 'glance',
        because: 'The gateway refused to show the initiative',
        root: { component: 'Alert', props: { variant: 'danger', title: 'This initiative cannot be shown', isInline: true }, children: refused.map((r) => ({ component: 'Content', props: { label: r } })) },
      }
    : loaded
      ? buildGlanceView(loaded.view, { methods: loaded.methods, runs, notice: processes.notice, controls: list.controls })
      : loadingView;
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

/** The initiatives to choose from, each opening At a glance. */
function InitiativeList({ list }: { list: GlanceList }) {
  const chat = useChat();
  const objects = list.initiatives;
  const controls = useObjectList(objects);
  return (
    <ViewRenderer
      view={buildGlanceListView(list, { controls: controls.controls })}
      host={{
        ...controls.host,
        values: controls.values,
        onField: controls.onField,
        onIntent: controls.onIntent,
        onOpen: (object) => {
          window.location.hash = `#/glance/${objects.find((o) => o.iri === object)?.identifier ?? ''}`;
        },
        onAsk: chat.askAbout,
      }}
    />
  );
}
