import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import axe from 'axe-core';
import { StrictMode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import type { ViewNode } from '../design-system/catalog';
import { RefusedError, type CommitResult, type DraftView, type GatewayClient, type MethodComposition } from '../data/client';
import { PrincipalProvider } from '../principal/PrincipalProvider';
import { ComposeDialog } from './ComposeDialog';

// Review a draft (design system spec 5.1), driven through the real dialog and renderer. The client is a stand-in for
// the gateway, so the page can be tested without a model; the gateway's own drafting is tested in drafting.test.ts.

const object = { iri: 'urn:SC-003', identifier: 'SC-003', type: 'urn:SafetyCase', typeLabel: 'Safety Case', title: 'A Safety Case title', pluralLabel: 'Safety Cases', state: {} };
const composition: MethodComposition = { method: 'urn:GenerateNarrative', label: 'Generate narrative', archetype: { archetype: 'urn:ReviewADraft', label: 'Review a draft' }, object, inputs: [] };
const draft: DraftView = {
  draft: 'urn:draft/1',
  method: composition.method,
  methodLabel: 'Generate narrative',
  object: object.iri,
  objectIdentifier: 'SC-003',
  text: 'The patient reported drug-induced liver injury.\n\nCausality was assessed as probable.',
  model: 'claude-opus-5-5',
  generatedAt: '2026-11-12T10:00:00Z',
  status: 'undecided',
  given: [{ iri: object.iri, identifier: 'SC-003' }, { iri: 'urn:P-101', identifier: 'P-101' }],
  requestedBy: 'urn:chloe',
  requestedByName: 'Chloé Martin',
};
const accepted: CommitResult = { commit: 'urn:c1', changes: [], created: [], pending: [], pendingDescriptions: [], background: [], fromDraft: { draft: draft.draft, model: draft.model, edited: false } };

function fakeClient(overrides: Partial<GatewayClient> = {}) {
  const client = {
    people: async () => [{ person: 'urn:chloe', name: 'Chloé Martin', roles: [{ role: 'urn:dsp', label: 'Drug Safety Physician' }] }],
    compose: vi.fn(async () => composition),
    draft: vi.fn(async () => draft),
    discardDraft: vi.fn(async () => ({ ...draft, status: 'discarded' as const })),
    commit: vi.fn(async () => accepted),
    preview: vi.fn(async () => {
      throw new RefusedError(['not used']);
    }),
    ...overrides,
  };
  return client as unknown as GatewayClient & typeof client;
}

let current: GatewayClient;
vi.mock('../data/client', async (original) => ({ ...(await original<typeof import('../data/client')>()), gatewayClient: async () => current }));

function open(client: GatewayClient) {
  current = client;
  const onDone = vi.fn<(c: MethodComposition, r: CommitResult) => void>();
  const onCancel = vi.fn<(notice?: ViewNode) => void>();
  const view = render(
    <StrictMode>
      <PrincipalProvider fallback={null}>
        <ComposeDialog object={object.iri} method={composition.method} onDone={onDone} onCancel={onCancel} />
      </PrincipalProvider>
    </StrictMode>,
  );
  return { ...view, onDone, onCancel };
}

describe('Review a draft', () => {
  it('asks for one draft as it opens, even when React mounts it twice, and shows it marked as generated', async () => {
    const client = fakeClient();
    open(client);
    expect(await screen.findByRole('heading', { level: 1, name: 'Generate narrative SC-003' })).toBeInTheDocument();
    expect(await screen.findByText('The patient reported drug-induced liver injury.')).toBeInTheDocument();
    expect(screen.getByText('Causality was assessed as probable.')).toBeInTheDocument();
    expect(screen.getByText('Generated draft, not reviewed')).toBeInTheDocument();
    expect(screen.getByText('claude-opus-5-5')).toBeInTheDocument();
    expect(screen.getByText('SC-003, P-101')).toBeInTheDocument();
    expect(client.draft).toHaveBeenCalledTimes(1);
    expect(client.preview).not.toHaveBeenCalled();
  });

  it('says it is drafting while the model writes', async () => {
    const { onCancel } = open(fakeClient({ draft: vi.fn(() => new Promise<DraftView>(() => {})) }));
    expect(await screen.findByText('The connected model is writing the draft. This can take a minute.')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Back' }));
    expect(onCancel).toHaveBeenCalledWith();
  });

  it('accepts the draft as written', async () => {
    const client = fakeClient();
    const { onDone } = open(client);
    await userEvent.click(await screen.findByRole('button', { name: 'Accept' }));
    await waitFor(() => expect(onDone).toHaveBeenCalledWith(composition, accepted));
    expect(client.commit).toHaveBeenCalledWith(expect.anything(), object.iri, composition.method, {}, undefined, { draft: draft.draft, text: draft.text });
  });

  it('accepts an edit of the draft', async () => {
    const client = fakeClient();
    open(client);
    await userEvent.click(await screen.findByRole('button', { name: 'Edit' }));
    const box = screen.getByRole('textbox', { name: 'Edit the draft' });
    expect(box).toHaveValue(draft.text);
    await userEvent.clear(box);
    expect(screen.getByRole('button', { name: 'Accept edited draft' })).toBeDisabled();
    await userEvent.type(box, 'The patient recovered.');
    await userEvent.click(screen.getByRole('button', { name: 'Accept edited draft' }));
    await waitFor(() => expect(client.commit).toHaveBeenCalledWith(expect.anything(), object.iri, composition.method, {}, undefined, { draft: draft.draft, text: 'The patient recovered.' }));
  });

  it('discards the draft and says so', async () => {
    const client = fakeClient();
    const { onCancel } = open(client);
    await userEvent.click(await screen.findByRole('button', { name: 'Discard' }));
    await waitFor(() => expect(onCancel).toHaveBeenCalledTimes(1));
    expect(client.discardDraft).toHaveBeenCalledWith(expect.anything(), draft.draft);
    expect(JSON.stringify(onCancel.mock.calls[0][0])).toContain('Generate narrative draft discarded for SC-003');
  });

  it('goes back without deciding', async () => {
    const client = fakeClient();
    const { onCancel } = open(client);
    await screen.findByRole('button', { name: 'Accept' });
    await userEvent.click(screen.getByRole('button', { name: 'Back' }));
    expect(onCancel).toHaveBeenCalledWith();
    expect(client.commit).not.toHaveBeenCalled();
    expect(client.discardDraft).not.toHaveBeenCalled();
  });

  it('shows the gateway’s reasons when no model is connected, and never a draft', async () => {
    open(fakeClient({ draft: vi.fn(async () => Promise.reject(new RefusedError(['No model is connected to draft this. A deployment connects one; previews never do.']))) }));
    expect(await screen.findByText('Generate narrative cannot be drafted')).toBeInTheDocument();
    expect(screen.getByText('No model is connected to draft this. A deployment connects one; previews never do.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Accept' })).not.toBeInTheDocument();
  });

  it('keeps the draft and shows the reasons when accepting is refused', async () => {
    const client = fakeClient({ commit: vi.fn(async () => Promise.reject(new RefusedError(['This draft was already accepted']))) });
    open(client);
    await userEvent.click(await screen.findByRole('button', { name: 'Accept' }));
    expect(await screen.findByText('This draft was already accepted')).toBeInTheDocument();
    expect(screen.getByText('The patient reported drug-induced liver injury.')).toBeInTheDocument();
  });

  it('has no detectable accessibility violations, reading or editing', async () => {
    const { container } = open(fakeClient());
    await screen.findByRole('button', { name: 'Accept' });
    const scan = async () => (await axe.run(container, { rules: { 'color-contrast': { enabled: false }, region: { enabled: false } } })).violations;
    expect(await scan()).toEqual([]);
    await userEvent.click(screen.getByRole('button', { name: 'Edit' }));
    expect(await scan()).toEqual([]);
  });
});
