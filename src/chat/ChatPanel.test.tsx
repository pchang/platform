import { act, render, screen, waitFor, within } from '@testing-library/react';
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
    <>
      <button ref={chat.trigger} onClick={chat.open}>
        Ask
      </button>
      <button onClick={() => chat.askAbout(ae.iri)}>From the card</button>
    </>
  );
}

function renderChat(ask: (question: string, earlier: AskTurn[]) => Promise<AskResult>) {
  const calls: { question: string; earlier: AskTurn[]; about: string[] }[] = [];
  current = {
    people: async () => [{ person: 'urn:ben', name: 'Ben Okafor', roles: [{ role: 'urn:cdm', label: 'Clinical Data Manager' }] }],
    ask: vi.fn(async (_p: unknown, question: string, earlier: AskTurn[] = [], about: string[] = []) => {
      calls.push({ question, earlier, about });
      return ask(question, earlier);
    }),
    read: async () => ({ ...ae, state: { Reporting: 'not reported' }, domainLabel: 'Clinical Development', urgency: 0, links: [], properties: {} }),
    methods: async () => [
      { method: 'urn:report', label: 'Report to safety', available: true, blocks: [], archetype: { archetype: 'urn:a', label: 'Fill in' } },
      { method: 'urn:lock', label: 'Reconcile', available: false, blocks: ['Not reported'], archetype: { archetype: 'urn:a', label: 'Confirm' } },
    ],
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

const bar = () => screen.getByRole('textbox', { name: /Search or ask|Send a message|Ask about/ });

describe('the chat panel', () => {
  it('opens with a greeting and prompts, and answers with the objects it cites and who answered', async () => {
    const { container } = renderChat(async (q) => answered(q));
    await userEvent.click(await screen.findByRole('button', { name: 'Ask' }));
    expect(screen.getByRole('heading', { level: 2, name: 'Ask' })).toBeInTheDocument();
    expect(screen.getByText('Search or ask anything')).toBeInTheDocument();
    expect(screen.getByText('Find objects, or ask about the work you may see.')).toBeInTheDocument();
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
    expect(screen.getByText('Search or ask anything')).toBeInTheDocument();
    expect(screen.getByText('Find objects, or ask about the work you may see.')).toBeInTheDocument();
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

  it('asks about an object: it leads the conversation with its state and methods, and every question carries it', async () => {
    const { calls } = renderChat(async (q) => answered(q));
    await userEvent.click(await screen.findByRole('button', { name: 'From the card' }));
    expect(await screen.findByText('Ask about AE-003')).toBeInTheDocument();
    expect(screen.getByText('AE-003 · Adverse Event')).toBeInTheDocument();
    expect(screen.getByText('Reporting: not reported')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Report to safety' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Reconcile' })).not.toBeInTheDocument();
    expect(bar()).toHaveAttribute('placeholder', 'Ask about AE-003');
    await userEvent.click(screen.getByRole('button', { name: /What can I do next on AE-003, and why\?/ }));
    await screen.findByText('AE-003 waits for you to report it.');
    expect(calls).toEqual([{ question: 'What can I do next on AE-003, and why?', earlier: [], about: [ae.iri] }]);
    await userEvent.click(screen.getByRole('button', { name: 'New conversation' }));
    expect(screen.getByText('Search or ask anything')).toBeInTheDocument();
    expect(screen.queryByText('Reporting: not reported')).not.toBeInTheDocument();
  });

  it('starts a new conversation for each object asked about, and keeps the earlier ones in the history to return to', async () => {
    const { calls } = renderChat(async (q) => answered(q));
    await userEvent.click(await screen.findByRole('button', { name: 'Ask' }));
    await userEvent.type(bar(), 'which events are not reported?{Enter}');
    await screen.findByText('AE-003 waits for you to report it.');
    await userEvent.click(screen.getByRole('button', { name: 'From the card' }));
    expect(await screen.findByText('Ask about AE-003')).toBeInTheDocument();
    expect(screen.queryByText('which events are not reported?')).not.toBeInTheDocument();

    // Both are in the history, newest first, named for their object or first question.
    await userEvent.click(screen.getByRole('button', { name: 'Conversations' }));
    const items = await screen.findAllByRole('menuitem');
    expect(items.map((i) => i.textContent)).toEqual(['AE-003 · Jaundice and raised liver enzymes', 'which events are not reported?']);
    // Choosing one restores it, and a follow-up in it carries its own earlier turns, with no object.
    await userEvent.click(items[1]);
    const conversation = () => within(document.querySelector<HTMLElement>('.pf-chatbot__messagebox')!);
    expect(await conversation().findByText('which events are not reported?')).toBeInTheDocument();
    expect(screen.queryByText('Reporting: not reported')).not.toBeInTheDocument();
    await userEvent.type(bar(), 'and which are overdue?{Enter}');
    await waitFor(() => expect(conversation().getAllByText('AE-003 waits for you to report it.')).toHaveLength(2));
    expect(calls.at(-1)).toMatchObject({ question: 'and which are overdue?', about: [], earlier: [{ question: 'which events are not reported?' }] });

    // A conversation not yet begun is reused, not kept empty.
    await userEvent.click(screen.getByRole('button', { name: 'New conversation' }));
    await userEvent.click(screen.getByRole('button', { name: 'New conversation' }));
    await userEvent.click(screen.getByRole('button', { name: 'Conversations' }));
    expect((await screen.findAllByRole('menuitem')).map((i) => i.textContent)).toEqual([
      'New conversation',
      'AE-003 · Jaundice and raised liver enzymes',
      'which events are not reported?',
    ]);
  });
});
