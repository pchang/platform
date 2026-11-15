import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import axe from 'axe-core';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AskResult, AskTurn, GatewayClient } from '../data/client';
import { NotificationsProvider } from '../notifications/NotificationsProvider';
import { ObjectPanelProvider } from '../objects/ObjectPanelProvider';
import { PrincipalProvider } from '../principal/PrincipalProvider';
import { ProcessProvider } from '../processes/ProcessProvider';
import { ChatPanel } from './ChatPanel';
import { ChatProvider, saidIn, useChat } from './ChatProvider';

// The chat panel (design system spec 4.1, Ask), driven through PatternFly's chatbot with a stand-in gateway; the
// gateway's own Ask is tested in ask.test.ts.

const ae = { iri: 'urn:AE-003', identifier: 'AE-003', type: 'urn:AE', typeLabel: 'Adverse Event', title: 'Jaundice and raised liver enzymes', pluralLabel: 'Adverse Events', state: {} };
const answered = (question: string): AskResult => ({ question, answer: { status: 'answered', text: 'AE-003 waits for you to report it.', cited: [ae], model: 'claude-opus-5-5', lookedAt: 4 } });
const searched = (question: string): AskResult => ({
  question,
  searched: 'No model is connected to answer questions, so the question was searched.',
  search: { query: question, interpretation: { types: [], states: [], identifiers: [], words: [], mine: false }, results: [{ object: ae, matched: [] }], total: 1, understoodBy: { ontology: true } },
});

let current: GatewayClient;
vi.mock('../data/client', async (original) => ({ ...(await original<typeof import('../data/client')>()), gatewayClient: async () => current }));

let wide = true;
beforeEach(() => {
  wide = true;
  window.matchMedia = ((query: string) => ({ matches: wide, media: query, addEventListener: () => {}, removeEventListener: () => {} })) as unknown as typeof window.matchMedia;
});

function OpenButton() {
  const chat = useChat();
  return (
    <button ref={chat.trigger} onClick={chat.open}>
      Ask
    </button>
  );
}

function renderChat(ask: (question: string, earlier: AskTurn[]) => Promise<AskResult>) {
  const calls: { question: string; earlier: AskTurn[] }[] = [];
  current = {
    people: async () => [{ person: 'urn:ben', name: 'Ben Okafor', roles: [{ role: 'urn:cdm', label: 'Clinical Data Manager' }] }],
    ask: vi.fn(async (_p: unknown, question: string, earlier: AskTurn[] = []) => {
      calls.push({ question, earlier });
      return ask(question, earlier);
    }),
    read: async () => {
      throw new Error('not read here');
    },
    runs: async () => [],
    notifications: async () => [],
  } as unknown as GatewayClient;
  const view = render(
    <PrincipalProvider fallback={null}>
      <NotificationsProvider>
        <ProcessProvider>
          <ObjectPanelProvider>
            <ChatProvider>
              <OpenButton />
              <ChatPanel />
            </ChatProvider>
          </ObjectPanelProvider>
        </ProcessProvider>
      </NotificationsProvider>
    </PrincipalProvider>,
  );
  return { ...view, calls };
}

const bar = () => screen.getByRole('textbox', { name: /Search or ask|Send a message/ });

describe('the chat panel', () => {
  it('opens with a greeting and prompts, and answers with the objects it cites and who answered', async () => {
    const { container } = renderChat(async (q) => answered(q));
    await userEvent.click(await screen.findByRole('button', { name: 'Ask' }));
    expect(screen.getByRole('heading', { level: 2, name: 'Ask' })).toBeInTheDocument();
    expect(screen.getByText('Ask about the work you may see, or search for it.')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /What needs me first today\?/ }));
    expect(await screen.findByText('AE-003 waits for you to report it.')).toBeInTheDocument();
    expect(screen.getByText('What needs me first today?')).toBeInTheDocument();
    expect(screen.getByText('AE-003 · Adverse Event')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Jaundice and raised liver enzymes' })).toBeInTheDocument();
    expect(screen.getByText('Answered by claude-opus-5-5, after looking at 4 objects.')).toBeInTheDocument();
    const results = await axe.run(container, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa'] } });
    expect(results.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`)).toEqual([]);
  });

  it('sends what was said before with a follow-up, and starts afresh on New conversation', async () => {
    const { calls } = renderChat(async (q) => answered(q));
    await userEvent.click(await screen.findByRole('button', { name: 'Ask' }));
    await userEvent.type(bar(), 'which events are not reported?{Enter}');
    await screen.findByText('AE-003 waits for you to report it.');
    await userEvent.type(bar(), 'and which are overdue?{Enter}');
    await screen.findAllByText('AE-003 waits for you to report it.');
    expect(calls.map((c) => c.earlier.length)).toEqual([0, 1]);
    expect(calls[1].earlier).toEqual([{ question: 'which events are not reported?', answer: 'AE-003 waits for you to report it.' }]);
    await userEvent.click(screen.getByRole('button', { name: 'New conversation' }));
    expect(screen.queryByText('AE-003 waits for you to report it.')).not.toBeInTheDocument();
    expect(screen.getByText('Ask about the work you may see, or search for it.')).toBeInTheDocument();
  });

  it('shows a question searched instead, with why, the matches and a way to the search page', async () => {
    renderChat(async (q) => searched(q));
    await userEvent.click(await screen.findByRole('button', { name: 'Ask' }));
    await userEvent.type(bar(), 'serious adverse events{Enter}');
    expect(await screen.findByText(/No model is connected to answer questions, so the question was searched\. Here is what a search found/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'See all 1 on the search page' })).toHaveAttribute('href', '#/search/serious%20adverse%20events');
    expect(saidIn(searched('x'))).toBe('No model is connected to answer questions, so the question was searched. The search found 1: AE-003.');
  });

  it('shows the gateway’s reasons when it refuses, and closes on Escape with focus back on Ask', async () => {
    const { RefusedError } = await import('../data/client');
    renderChat(async () => {
      throw new RefusedError(['The gateway is busy']);
    });
    const ask = await screen.findByRole('button', { name: 'Ask' });
    await userEvent.click(ask);
    await userEvent.type(bar(), 'anything{Enter}');
    expect(await screen.findByText('The gateway is busy')).toBeInTheDocument();
    await act(async () => {
      await userEvent.keyboard('{Escape}');
    });
    expect(screen.queryByRole('heading', { level: 2, name: 'Ask' })).not.toBeInTheDocument();
    expect(ask).toHaveFocus();
  });
});
