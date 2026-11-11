// @vitest-environment node
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { NS } from '../ontology/ontology';
import { GatewayError } from './gateway';
import { openGateway } from './node';
import { JournalError } from './journal';

// Each test restarts the gateway, which replays the journal and validates a commit or two.
vi.setConfig({ testTimeout: 20_000 });

const ls = (n: string) => `${NS.ls}${n}`;
const elena = { person: `${NS.d}person-elena`, role: ls('QualityLead') };
const ben = { person: `${NS.d}person-ben`, role: ls('ClinicalDataManager') };

let dir: string;
const journalPath = () => join(dir, 'journal.jsonl');
afterEach(() => rmSync(dir, { recursive: true, force: true }));
const fresh = () => {
  dir = mkdtempSync(join(tmpdir(), 'lsh-journal-'));
  return openGateway(journalPath());
};
const lines = () => readFileSync(journalPath(), 'utf8').split('\n').filter(Boolean);

describe('persistence (platform spec 3.4)', () => {
  it('keeps every commit and its history across a restart', async () => {
    const first = fresh();
    await first.commit(elena, 'B-002', ls('QuarantineBatch'), { reason: 'Deviation' });
    await first.commit(elena, 'QE-1', ls('StartInvestigation'), { investigator: 'person-elena' });

    const restarted = openGateway(journalPath());
    expect(restarted.read(elena, 'B-002').state.Quality).toBe('quarantined');
    expect(restarted.read(elena, 'QE-1').state.Status).toBe('investigating');
    expect(restarted.commits().map((c) => c.method)).toEqual([ls('QuarantineBatch'), ls('StartInvestigation')]);

    // New commits continue the numbering and the chain.
    const next = await restarted.commit(elena, 'QE-1', ls('AssignCAPA'), { owner: 'person-elena', action: 'Requalify the line' });
    expect(next.commit).toBe(`${NS.d}commit/3`);
    expect(openGateway(journalPath()).read(elena, next.created[0]).state.Status).toBe('planned');
  });

  it('keeps the audit trail of personal-data reads', () => {
    fresh().read(ben, 'PT-03');
    expect(openGateway(journalPath()).reads().map((r) => r.object)).toEqual([`${NS.d}PT-03`]);
  });

  it('writes nothing for a refused commit', async () => {
    const gateway = fresh();
    await expect(gateway.commit(elena, 'B-002', ls('ReleaseBatch'), { reviewer: 'person-elena' })).rejects.toBeInstanceOf(GatewayError);
    expect(lines()).toHaveLength(1); // genesis only
  });

  it('refuses to start when any past entry was changed', async () => {
    const gateway = fresh();
    await gateway.commit(elena, 'B-002', ls('QuarantineBatch'), { reason: 'Deviation' });
    await gateway.commit(elena, 'QE-1', ls('StartInvestigation'), { investigator: 'person-elena' });
    const tampered = lines();
    tampered[1] = tampered[1].replace('quarantined', 'released');
    writeFileSync(journalPath(), `${tampered.join('\n')}\n`);
    expect(() => openGateway(journalPath())).toThrow(new JournalError('Journal entry 1 does not match its fingerprint. The journal may have been changed.'));
  });

  it('refuses to start when an entry was removed', async () => {
    const gateway = fresh();
    await gateway.commit(elena, 'B-002', ls('QuarantineBatch'), { reason: 'Deviation' });
    await gateway.commit(elena, 'QE-1', ls('StartInvestigation'), { investigator: 'person-elena' });
    const [genesis, , second] = lines();
    writeFileSync(journalPath(), `${genesis}\n${second}\n`);
    expect(() => openGateway(journalPath())).toThrow(JournalError);
  });

  it('refuses to replay a journal onto a different seed graph', () => {
    fresh();
    expect(() => openGateway(journalPath(), { extraTurtle: ['<urn:x> <urn:y> <urn:z> .'] })).toThrow(
      new JournalError('The journal was written on a different seed graph. Replaying it would give a wrong state.'),
    );
  });
});

describe('one commit at a time', () => {
  it('runs simultaneous commits in turn, so the second sees the first', async () => {
    const gateway = fresh();
    const results = await Promise.allSettled([
      gateway.commit(elena, 'B-002', ls('QuarantineBatch'), { reason: 'First' }),
      gateway.commit(elena, 'B-002', ls('QuarantineBatch'), { reason: 'Second' }),
    ]);
    expect(results.map((r) => r.status)).toEqual(['fulfilled', 'rejected']);
    expect(((results[1] as PromiseRejectedResult).reason as GatewayError).reasons).toEqual(['Quality is not pending or released']);
    expect(lines()).toHaveLength(2);
  });

  it('never shows a reader a commit that has not finished', async () => {
    const gateway = fresh();
    const pending = gateway.commit(elena, 'B-002', ls('QuarantineBatch'), { reason: 'Deviation' });
    expect(gateway.read(elena, 'B-002').state.Quality).toBe('pending');
    await pending;
    expect(gateway.read(elena, 'B-002').state.Quality).toBe('quarantined');
  });
});
