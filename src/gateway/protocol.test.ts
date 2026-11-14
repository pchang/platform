import { describe, expect, it } from 'vitest';
import { NS } from '../ontology/ontology';
import { withSeed } from './node';

// Protocol, added to the life sciences ontology and seed alone (domain spec 3.1 and 3.3): no code knows it. These run it
// through the gateway as any other type: its relationships, its methods, a signed approval and an amendment.

const ls = (n: string) => `${NS.ls}${n}`;
const ben = { person: `${NS.d}person-ben`, role: ls('ClinicalDataManager') };

describe('a protocol, from the ontology alone', () => {
  it('reads with its relationships both ways: the studies it governs and the versions around it', () => {
    const gateway = withSeed();
    const v2 = gateway.read(ben, 'PROT-2');
    expect(v2.title).toBe('VELOCITY-2 protocol, version 2.0');
    expect(v2.state).toEqual({ Status: 'approved' });
    const end = (label: string) => v2.links.find((l) => l.label === label);
    expect(end('governs')?.objects.map((o) => o.identifier)).toEqual(['ST-01']);
    expect(end('amends')).toMatchObject({ one: true, objects: [expect.objectContaining({ identifier: 'PROT-1' })] });
    expect(end('is amended by')?.objects.map((o) => o.identifier)).toEqual(['PROT-3']);
  });

  it('is sent for review, approved with a signature, which supersedes the version it amends, then amended again', async () => {
    const gateway = withSeed([], { developmentSignatures: true, now: () => new Date('2026-11-14T10:00:00Z') });
    await gateway.commit(ben, 'PROT-3', ls('SendProtocolForReview'));
    const approved = await gateway.commit(ben, 'PROT-3', ls('ApproveProtocol'), {}, { typedName: 'Ben Okafor' });
    expect(approved.signature).toMatchObject({ signerName: 'Ben Okafor', meaning: 'Approval: I approve this protocol version for use in the study.', development: true });
    expect(approved.pendingDescriptions).toEqual(['Moves the studies the amended version governs to this version.']);
    expect(gateway.read(ben, 'PROT-3').state).toEqual({ Status: 'approved' });
    expect(gateway.read(ben, 'PROT-2').state).toEqual({ Status: 'superseded' });

    const amended = await gateway.commit(ben, 'PROT-3', ls('AmendProtocol'), { summary: 'Shortens the screening window to 21 days' });
    const draft = gateway.read(ben, amended.created[0]);
    expect(draft).toMatchObject({ title: 'Amendment to PROT-3', state: { Status: 'draft' }, properties: { 'amendment summary': 'Shortens the screening window to 21 days' } });
    // One amendment at a time.
    await expect(gateway.commit(ben, 'PROT-3', ls('AmendProtocol'), { summary: 'Another' })).rejects.toMatchObject({ reasons: ['This version already has an amendment in progress'] });
  });
});
