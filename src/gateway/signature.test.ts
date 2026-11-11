// @vitest-environment node
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { NS, select } from '../ontology/ontology';
import { openGateway, withSeed } from './node';

// Electronic signatures (platform spec 3.4). Each test commits a few methods.
vi.setConfig({ testTimeout: 20_000 });

const ls = (n: string) => `${NS.ls}${n}`;
const chloe = { person: `${NS.d}person-chloe`, role: ls('DrugSafetyPhysician') };
const dev = { person: `${NS.d}person-dev`, role: ls('DrugSafetyPhysician') };

/** SUB-1, prepared by Chloé, sent for review so it can be submitted. */
async function inReview(options: Parameters<typeof withSeed>[1] = { developmentSignatures: true }) {
  const gateway = withSeed([], options);
  await gateway.commit(chloe, 'SUB-1', ls('SendForReview'), { reviewer: dev.person });
  return gateway;
}

describe('electronic signatures', () => {
  it('asks the signer to agree to the meaning, and fixes the person input to the signer', async () => {
    const submit = await (await inReview()).compose(dev, 'SUB-1', ls('Submit'));
    expect(submit.archetype.label).toBe('Review and sign');
    expect(submit.signature).toEqual({
      signer: dev.person,
      signerName: 'Dev Raman',
      meaning: 'Approval: I approve this report for submission to the regulatory authority.',
      development: true,
    });
    expect(submit.inputs[0]).toMatchObject({ name: 'approver', kind: 'person', default: dev.person, choices: [{ value: dev.person, label: 'Dev Raman' }] });
  });

  it('records the signature with the commit: signer, time and meaning', async () => {
    const gateway = await inReview({ developmentSignatures: true, now: () => new Date('2026-11-11T09:30:00Z') });
    const result = await gateway.commit(dev, 'SUB-1', ls('Submit'), { approver: dev.person }, { typedName: '  dev   raman ' });
    expect(result.signature).toEqual({ signerName: 'Dev Raman', signedAt: '2026-11-11T09:30:00.000Z', meaning: expect.stringMatching(/^Approval:/), development: true });
    const store = (gateway as unknown as { graph: { store: Parameters<typeof select>[0] } }).graph.store;
    const recorded = select(store, `SELECT ?by ?at ?dev WHERE { GRAPH <${result.commit}> { <${result.commit}> p:signature ?s . ?s p:signedBy ?by ; p:signedAt ?at ; p:isDevelopmentSignature ?dev } }`);
    expect(recorded).toEqual([{ by: dev.person, at: '2026-11-11T09:30:00Z', dev: 'true' }]);
  });

  it('refuses a commit without a signature, or with someone else’s name', async () => {
    const gateway = await inReview();
    await expect(gateway.commit(dev, 'SUB-1', ls('Submit'), { approver: dev.person })).rejects.toMatchObject({ reasons: ['This method needs your signature.'] });
    await expect(gateway.commit(dev, 'SUB-1', ls('Submit'), { approver: dev.person }, { typedName: 'Chloé Martin' })).rejects.toMatchObject({ reasons: ['The typed name does not match your name.'] });
  });

  it('never lets anyone sign for someone else', async () => {
    const gateway = await inReview();
    await expect(gateway.preview(dev, 'SUB-1', ls('Submit'), { approver: chloe.person })).rejects.toMatchObject({
      reasons: expect.arrayContaining(['Approver must be you: nobody signs for someone else']),
    });
  });

  it('still applies rule 5: the preparer cannot approve, even signing as themselves', async () => {
    await expect((await inReview()).preview(chloe, 'SUB-1', ls('Submit'), { approver: chloe.person })).rejects.toMatchObject({
      reasons: ['Approver must be someone else (rule 5: separation of duties)'],
    });
  });

  it('refuses to sign outside development mode, until an identity provider exists', async () => {
    const gateway = await inReview({});
    await expect(gateway.commit(dev, 'SUB-1', ls('Submit'), { approver: dev.person }, { typedName: 'Dev Raman' })).rejects.toMatchObject({
      reasons: ['Signing needs an identity provider, and none is connected yet.'],
    });
  });

  it('keeps the signature in the journal across a restart', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'lsh-sign-'));
    try {
      const journal = join(dir, 'journal.jsonl');
      const gateway = openGateway(journal, { developmentSignatures: true });
      await gateway.commit(chloe, 'SUB-1', ls('SendForReview'), { reviewer: dev.person });
      await gateway.commit(dev, 'SUB-1', ls('Submit'), { approver: dev.person }, { typedName: 'Dev Raman' });
      expect(readFileSync(journal, 'utf8')).toContain('isDevelopmentSignature');
      expect(openGateway(journal, { developmentSignatures: true }).read(dev, 'SUB-1').state.Status).toBe('submitted');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

it('never lets an agent sign', async () => {
  // No role lets the CRO agent run a signed method, so give it one for this test only.
  const extra = `@prefix p: <${NS.p}> . @prefix ls: <${NS.ls}> . ls:ExternalCROAgent p:mayRun ls:Submit .`;
  const gateway = withSeed([extra], { developmentSignatures: true });
  await gateway.commit(chloe, 'SUB-1', ls('SendForReview'), { reviewer: dev.person });
  const agent = { person: `${NS.d}agent-northbridge`, role: ls('ExternalCROAgent') };
  await expect(gateway.commit(agent, 'SUB-1', ls('Submit'), { approver: agent.person }, { typedName: 'Northbridge CRO agent' })).rejects.toMatchObject({
    reasons: ['Only a person can sign. Agents never sign.'],
  });
});
