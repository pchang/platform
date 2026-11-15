import { render, screen } from '@testing-library/react';
import axe from 'axe-core';
import { describe, expect, it, vi } from 'vitest';
import type { AskResult, GatewayClient } from '../data/client';
import { NotificationsProvider } from '../notifications/NotificationsProvider';
import { ObjectPanelProvider } from '../objects/ObjectPanelProvider';
import { PrincipalProvider } from '../principal/PrincipalProvider';
import { ProcessProvider } from '../processes/ProcessProvider';
import { ChatProvider } from '../chat/ChatProvider';
import { SearchView } from './OrientViews';

// The search page asks the gateway (platform spec 5.2, Asking a question; design system spec 4.1, Search). The client is
// a stand-in, so the page can be tested with an answer; the gateway's own asking is tested in ask.test.ts.

const ae = { iri: 'urn:AE-003', identifier: 'AE-003', type: 'urn:AE', typeLabel: 'Adverse Event', title: 'Jaundice and raised liver enzymes', pluralLabel: 'Adverse Events', state: { Reporting: 'not reported' } };

let current: GatewayClient;
vi.mock('../data/client', async (original) => ({ ...(await original<typeof import('../data/client')>()), gatewayClient: async () => current }));

function page(ask: (question: string) => Promise<AskResult>) {
  current = {
    me: async () => ({ mode: 'preview' as const }),
    people: async () => [{ person: 'urn:ben', name: 'Ben Okafor', roles: [{ role: 'urn:cdm', label: 'Clinical Data Manager' }] }],
    ask: vi.fn(async (_p: unknown, question: string) => ask(question)),
    methods: async () => [{ method: 'urn:report', label: 'Report to safety', available: true, blocks: [], archetype: { archetype: 'urn:a', label: 'Fill in' } }],
    runs: async () => [],
    notifications: async () => [],
  } as unknown as GatewayClient;
  return render(
    <PrincipalProvider fallback={null}>
      <NotificationsProvider>
        <ProcessProvider>
          <ObjectPanelProvider>
            <ChatProvider>
              <SearchView query="which serious events are not reported?" />
            </ChatProvider>
          </ObjectPanelProvider>
        </ProcessProvider>
      </NotificationsProvider>
    </PrincipalProvider>,
  );
}

describe('the search page', () => {
  it('says it is working on the question, then leads with the answer, its links and its objects', async () => {
    let answer!: (r: AskResult) => void;
    const { container } = page(() => new Promise((resolve) => (answer = resolve)));
    expect(await screen.findByText('Working on “which serious events are not reported?”…', undefined, { timeout: 5000 })).toBeInTheDocument();
    answer({
      question: 'which serious events are not reported?',
      answer: { status: 'answered', text: 'One: AE-003. It waits for you to report it.', cited: [ae], model: 'claude-opus-5-5', lookedAt: 2 },
    });
    expect(await screen.findByRole('heading', { level: 2, name: 'Answer' })).toBeInTheDocument();
    expect(screen.getByText('One: AE-003. It waits for you to report it.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'AE-003' })).toBeInTheDocument();
    expect(screen.getByText('Answered by claude-opus-5-5, after looking at 2 objects.')).toBeInTheDocument();
    expect(await screen.findByRole('button', { name: 'Report to safety' })).toBeInTheDocument();
    const results = await axe.run(container, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa'] } });
    expect(results.violations.map((v) => v.id)).toEqual([]);
  });

  it('shows the search, and says quietly why, when the question was searched', async () => {
    page(async (question) => ({
      question,
      searched: 'No model is connected to answer questions, so the question was searched.',
      search: { query: question, interpretation: { types: [], states: [], identifiers: [], words: ['serious'], mine: false }, results: [{ object: ae, matched: [] }], total: 1, understoodBy: { ontology: true } },
    }));
    expect(await screen.findByText('No model is connected to answer questions, so the question was searched.', undefined, { timeout: 5000 })).toBeInTheDocument();
    expect(screen.getByText('1 match for “which serious events are not reported?”.')).toBeInTheDocument();
  });
});
