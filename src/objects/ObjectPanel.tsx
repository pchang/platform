import {
  Button,
  Drawer,
  DrawerActions,
  DrawerCloseButton,
  DrawerContent,
  DrawerContentBody,
  DrawerHead,
  DrawerPanelBody,
  DrawerPanelContent,
  Tooltip,
} from '@patternfly/react-core';
import ArrowLeftIcon from '@patternfly/react-icons/dist/esm/icons/arrow-left-icon';
import CompressIcon from '@patternfly/react-icons/dist/esm/icons/compress-icon';
import ExpandIcon from '@patternfly/react-icons/dist/esm/icons/expand-icon';
import { useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import type { ViewSpec } from '../design-system/catalog';
import { RefusedError, type MethodOption, type ObjectView } from '../data/client';
import { useNotifications } from '../notifications/NotificationsProvider';
import { usePrincipal } from '../principal/PrincipalProvider';
import { useFrontIsPage } from '../processes/ProcessHost';
import { useProcesses } from '../processes/ProcessProvider';
import { ViewRenderer } from '../renderer/Renderer';
import { buildObjectView, OBJECT_TAB_FIELD } from '../views/objectView';
import { loadingView } from '../views/orientViews';
import { useActiveRuns, useOpenMethod } from '../views/OrientViews';
import { useMediaQuery } from '../chrome/useMediaQuery';
import { useObjectPanel } from './ObjectPanelProvider';
import './ObjectPanel.css';

/**
 * The object panel (design system spec 4.4): PatternFly's Drawer, its panel over the content area, as in PatternFly's
 * primary-detail pattern. The content area is the drawer's content; the panel shows the object last opened.
 */
export function ObjectDrawer({ children }: { children: ReactNode }) {
  const panel = useObjectPanel();
  // A page pattern takes the view's place while it is in front, so the panel steps aside until it ends.
  const frontIsPage = useFrontIsPage();
  const isOpen = panel.stack.length > 0 && !frontIsPage;
  const content = (
    <DrawerPanelContent
      className="app-object-panel"
      widths={panel.isExpanded ? { default: 'width_100' } : { default: 'width_100', lg: 'width_75' }}
      // Escape closes the whole panel (design system spec 4.4).
      onKeyDown={(event: KeyboardEvent) => {
        if (event.key === 'Escape' && !event.defaultPrevented) panel.close();
      }}
    >
      {panel.stack.length > 0 && <PanelInner />}
    </DrawerPanelContent>
  );
  return (
    <Drawer isExpanded={isOpen} position="end" className="app-object-drawer">
      <DrawerContent panelContent={content}>
        <DrawerContentBody hasPadding className="app-object-drawer__content">
          {children}
        </DrawerContentBody>
      </DrawerContent>
    </Drawer>
  );
}

const prefersReducedMotion = () => typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

/** The panel's top bar and its content, which slides as the person moves in and back (design system spec 4.4). */
function PanelInner() {
  const panel = useObjectPanel();
  const current = panel.stack.at(-1)!;
  const previous = panel.stack.at(-2);
  // What each object looked like when last shown, so the one moving out keeps its place as it slides away.
  const shown = useRef(new Map<string, { view: ViewSpec; identifier?: string }>());
  // The tab chosen on each object, so moving back returns to it.
  const [tabs, setTabs] = useState<Record<string, string>>({});
  const [leaving, setLeaving] = useState<{ object: string; view: ViewSpec; direction: 'in' | 'back' }>();
  const last = useRef(current);
  useEffect(() => {
    if (last.current === current) return;
    const outgoing = last.current;
    last.current = current;
    const view = shown.current.get(outgoing)?.view;
    if (panel.moved === 'fresh' || !view || prefersReducedMotion()) {
      setLeaving(undefined);
      return;
    }
    setLeaving({ object: outgoing, view, direction: panel.moved });
  }, [current, panel.moved]);

  const backTo = previous ? shown.current.get(previous)?.identifier : undefined;
  // Below lg the panel already takes the whole content area, so there is nothing to expand.
  const canExpand = useMediaQuery('(min-width: 992px)');
  const slide = panel.moved === 'in' ? 'app-slide-in-from-end' : panel.moved === 'back' ? 'app-slide-in-from-start' : '';

  return (
    <>
      <DrawerHead className="app-object-panel__head">
        <div>
          {previous && (
            <Tooltip content={backTo ? `Back to ${backTo}` : 'Back'}>
              <Button variant="plain" icon={<ArrowLeftIcon />} aria-label={backTo ? `Back to ${backTo}` : 'Back'} onClick={panel.back} />
            </Tooltip>
          )}
        </div>
        <DrawerActions>
          {canExpand && (
            <Tooltip content={panel.isExpanded ? 'Restore' : 'Expand'}>
              <Button variant="plain" icon={panel.isExpanded ? <CompressIcon /> : <ExpandIcon />} aria-label={panel.isExpanded ? 'Restore' : 'Expand'} onClick={panel.toggleExpanded} />
            </Tooltip>
          )}
          <DrawerCloseButton onClick={panel.close} aria-label="Close" />
        </DrawerActions>
      </DrawerHead>
      <DrawerPanelBody className="app-object-panel__body">
        <div className="app-object-stage">
          {leaving && (
            <div
              className={`app-object-layer app-object-layer--leaving ${leaving.direction === 'in' ? 'app-slide-out-to-start' : 'app-slide-out-to-end'}`}
              inert
              onAnimationEnd={() => setLeaving(undefined)}
            >
              <ViewRenderer view={leaving.view} host={{ values: { [OBJECT_TAB_FIELD]: tabs[leaving.object] ?? '' } }} />
            </div>
          )}
          <div key={`${panel.stack.length} ${current}`} className={`app-object-layer ${slide}`}>
            <ObjectContent
              object={current}
              focusOnLoad
              tab={tabs[current]}
              onTab={(tab) => setTabs((t) => ({ ...t, [current]: tab }))}
              onShown={(view, identifier) => shown.current.set(current, { view, identifier })}
            />
          </div>
        </div>
      </DrawerPanelBody>
    </>
  );
}

/** One object, read through the gateway as the person, with the methods they can run on it and on what it lists. */
function ObjectContent({
  object,
  focusOnLoad,
  tab,
  onTab,
  onShown,
}: {
  object: string;
  focusOnLoad: boolean;
  tab?: string;
  onTab: (tab: string) => void;
  onShown: (view: ViewSpec, identifier: string) => void;
}) {
  const { client, principal } = usePrincipal();
  const { changes } = useNotifications();
  const processes = useProcesses();
  const panel = useObjectPanel();
  const [loaded, setLoaded] = useState<{ view: ObjectView; methods: MethodOption[]; related: Map<string, MethodOption[]> }>();
  const [refused, setRefused] = useState<string[]>();
  const runs = useActiveRuns([object, processes.changes, changes]);
  const openMethod = useOpenMethod((target, method) => {
    if (!loaded) return undefined;
    const option = (target === loaded.view.iri ? loaded.methods : loaded.related.get(target))?.find((m) => m.method === method);
    const summary = target === loaded.view.iri ? loaded.view : loaded.view.links.flatMap((l) => l.objects).find((o) => o.iri === target);
    return summary && option && { object: summary, method: option };
  });

  // Read again after every commit and notification, so the panel shows the object as it now is.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const view = await client.read(principal, object);
        const listed = [...new Set(view.links.flatMap((l) => l.objects.map((o) => o.iri)))];
        const [methods, related] = await Promise.all([
          client.methods(principal, object),
          Promise.all(listed.map(async (o) => [o, await client.methods(principal, o)] as const)).then((entries) => new Map(entries)),
        ]);
        if (!cancelled) setLoaded({ view, methods, related });
      } catch (error) {
        if (!cancelled) setRefused(error instanceof RefusedError ? error.reasons : [String(error)]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [client, principal, object, processes.changes, changes]);

  const spec: ViewSpec = refused
    ? {
        pattern: 'object',
        because: 'The gateway refused to read the object',
        root: { component: 'Alert', props: { variant: 'danger', title: 'This object cannot be shown', isInline: true }, children: refused.map((r) => ({ component: 'Content', props: { label: r } })) },
      }
    : loaded
      ? buildObjectView(loaded.view, { methods: loaded.methods, related: loaded.related, runs, notice: processes.notice })
      : loadingView;

  useEffect(() => {
    if (loaded) onShown(spec, loaded.view.identifier);
  });

  // Focus moves to the object's heading as it is shown, so the person is told where they are.
  const frame = useRef<HTMLDivElement>(null);
  const focused = useRef(false);
  useEffect(() => {
    if (!focusOnLoad || focused.current || !(loaded || refused)) return;
    const heading = frame.current?.querySelector<HTMLElement>('h2, .pf-v6-c-alert__title');
    if (!heading) return;
    focused.current = true;
    heading.setAttribute('tabindex', '-1');
    heading.focus({ preventScroll: true });
  }, [focusOnLoad, loaded, refused]);

  return (
    <div ref={frame}>
      <ViewRenderer
        view={spec}
        host={{
          values: { [OBJECT_TAB_FIELD]: tab ?? '' },
          onField: (field, value) => field === OBJECT_TAB_FIELD && onTab(value),
          onAction: (action) => openMethod(action.target, action.method),
          onOpen: (target) => panel.moveIn(target),
        }}
      />
    </div>
  );
}
