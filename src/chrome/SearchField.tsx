import { Content, List, ListItem, SearchInput } from '@patternfly/react-core';
import { useEffect, useState } from 'react';
import type { SearchResult } from '../data/client';
import { usePrincipal } from '../principal/PrincipalProvider';
import { routeHref } from '../routing';
import './SearchField.css';

/** How long typing pauses before the gateway is asked. */
const SEARCH_DEBOUNCE_MS = 200;
/** Matches shown under the field (design system spec 4.1, Search). */
const SHOWN = 5;

/**
 * The search field at the head of the sidebar (design system spec 4.1, Search): the best matches under it as the person
 * types, with a count read out as it changes; Enter, or See all, opens the search page.
 */
export function SearchField({ query: routeQuery, onNavigate, isHidden = false }: { query?: string; onNavigate: () => void; isHidden?: boolean }) {
  const { client, principal } = usePrincipal();
  const [value, setValue] = useState(routeQuery ?? '');
  const [result, setResult] = useState<SearchResult>();
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
      client.search(principal, query).then((r) => !cancelled && setResult(r), () => !cancelled && setResult(undefined));
    }, SEARCH_DEBOUNCE_MS);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [client, principal, query, routeQuery]);

  const go = (q: string) => {
    if (!q.trim()) return;
    window.location.hash = routeHref({ name: 'search', query: q.trim() });
    setResult(undefined);
    onNavigate();
  };

  return (
    // While the sidebar is a closed drawer it is hidden from assistive technology, so the field must not take focus either.
    <search className="app-search" inert={isHidden}>
      <SearchInput
        aria-label="Search objects"
        placeholder="Search, such as open queries"
        value={value}
        onChange={(_event, v) => setValue(v)}
        onSearch={(_event, v) => go(v)}
        onClear={() => setValue('')}
      />
      <Content component="small" aria-live="polite" className="app-search__count">
        {result ? (result.total ? `${result.total} ${result.total === 1 ? 'match' : 'matches'}` : 'Nothing matches') : ''}
      </Content>
      {result && result.results.length > 0 && (
        <List isPlain aria-label="Best matches" className="app-search__matches">
          {result.results.slice(0, SHOWN).map((r) => (
            <ListItem key={r.object.iri}>
              <a href={routeHref({ name: 'search', query: r.object.identifier })} onClick={() => { setResult(undefined); onNavigate(); }}>
                {r.object.identifier}
              </a>{' '}
              <Content component="small" className="app-search__type">
                {r.object.typeLabel}
              </Content>
            </ListItem>
          ))}
          <ListItem>
            <a href={routeHref({ name: 'search', query })} onClick={() => { setResult(undefined); onNavigate(); }}>
              See all {result.total}
            </a>
          </ListItem>
        </List>
      )}
    </search>
  );
}
