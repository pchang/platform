import { Content, List, ListItem, Panel, PanelMain, PanelMainBody, SearchInput } from '@patternfly/react-core';
import { useEffect, useRef, useState } from 'react';
import type { SearchResult } from '../data/client';
import { usePrincipal } from '../principal/PrincipalProvider';
import { routeHref } from '../routing';
import './SearchField.css';

/** How long typing pauses before the gateway is asked. */
const SEARCH_DEBOUNCE_MS = 200;
/** Matches shown under the field (design system spec 4.1, Search). */
const SHOWN = 5;

/**
 * The search field in the masthead (design system spec 4.1, Search): the best matches in a raised panel under it as the
 * person types, with a count read out as it changes; Enter, or See all, opens the search page. Escape or a click outside
 * closes the panel; Escape with no panel open is passed to onEscape, which closes the phone's search row.
 */
export function SearchField({ query: routeQuery, onNavigate, onEscape, autoFocus = false }: { query?: string; onNavigate: () => void; onEscape?: () => void; autoFocus?: boolean }) {
  const { client, principal } = usePrincipal();
  const [value, setValue] = useState(routeQuery ?? '');
  const [result, setResult] = useState<SearchResult>();
  const [isPanelOpen, setPanelOpen] = useState(false);
  const root = useRef<HTMLElement>(null);
  const input = useRef<HTMLInputElement>(null);
  // The phone's search row opens with focus in the field.
  useEffect(() => {
    if (autoFocus) input.current?.focus();
  }, [autoFocus]);
  // Opening a search page puts its query in the field.
  useEffect(() => {
    if (routeQuery !== undefined) setValue(routeQuery);
  }, [routeQuery]);

  const query = value.trim();
  useEffect(() => {
    if (!query || query === routeQuery) {
      setResult(undefined);
      return;
    }
    let cancelled = false;
    const timer = setTimeout(() => {
      // Suggestions come from the ontology reading: the model is asked once per search, not once per keystroke.
      client.search(principal, query, { understand: 'ontology' }).then(
        (r) => {
          if (cancelled) return;
          setResult(r);
          setPanelOpen(true);
        },
        () => !cancelled && setResult(undefined),
      );
    }, SEARCH_DEBOUNCE_MS);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [client, principal, query, routeQuery]);

  // A click outside the field and its panel closes the panel.
  useEffect(() => {
    if (!isPanelOpen) return;
    const outside = (event: MouseEvent) => {
      if (!root.current?.contains(event.target as Node)) setPanelOpen(false);
    };
    document.addEventListener('mousedown', outside);
    return () => document.removeEventListener('mousedown', outside);
  }, [isPanelOpen]);

  const done = () => {
    setResult(undefined);
    setPanelOpen(false);
    onNavigate();
  };
  const go = (q: string) => {
    if (!q.trim()) return;
    window.location.hash = routeHref({ name: 'search', query: q.trim() });
    done();
  };
  const shown = isPanelOpen && result !== undefined;

  return (
    <search
      className="app-search"
      ref={root}
      onKeyDown={(event) => {
        if (event.key !== 'Escape') return;
        if (shown) setPanelOpen(false);
        else onEscape?.();
      }}
      onFocus={() => result && setPanelOpen(true)}
    >
      <SearchInput
        aria-label="Search objects"
        placeholder="Search, such as open queries"
        value={value}
        onChange={(_event, v) => setValue(v)}
        onSearch={(_event, v) => go(v)}
        onClear={() => setValue('')}
        ref={input}
      />
      {/* Read out as it changes, whether or not the panel is open. */}
      <Content component="small" role="status" className="pf-v6-screen-reader">
        {result ? (result.total ? `${result.total} ${result.total === 1 ? 'match' : 'matches'}` : 'Nothing matches') : ''}
      </Content>
      {shown && (
        <Panel variant="raised" className="app-search__panel">
          <PanelMain>
            <PanelMainBody>
              <Content component="small" className="app-search__count" aria-hidden="true">
                {result.total ? `${result.total} ${result.total === 1 ? 'match' : 'matches'}` : 'Nothing matches'}
              </Content>
              {result.results.length > 0 && (
                <List isPlain aria-label="Best matches" className="app-search__matches">
                  {result.results.slice(0, SHOWN).map((r) => (
                    <ListItem key={r.object.iri}>
                      <a href={routeHref({ name: 'search', query: r.object.identifier })} onClick={done}>
                        {r.object.identifier}
                      </a>{' '}
                      <Content component="small" className="app-search__type">
                        {r.object.typeLabel}
                      </Content>
                    </ListItem>
                  ))}
                  <ListItem>
                    <a href={routeHref({ name: 'search', query })} onClick={done}>
                      See all {result.total}
                    </a>
                  </ListItem>
                </List>
              )}
            </PanelMainBody>
          </PanelMain>
        </Panel>
      )}
    </search>
  );
}
