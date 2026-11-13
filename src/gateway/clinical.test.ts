// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import { NS } from '../ontology/ontology';
import { GatewayError } from './gateway';
import { withSeed } from './node';

// The clinical roles' work (domain spec sections 3.3 and 6): the Clinical Research Coordinator at the site, the
// Clinical Research Associate monitoring it, and the Clinical Data Manager.
vi.setConfig({ testTimeout: 30_000 });

const ls = (n: string) => `${NS.ls}${n}`;
const as = (person: string, role: string) => ({ person: `${NS.d}${person}`, role: ls(role) });
const crc = as('person-sam', 'ClinicalResearchCoordinator');
const cra = as('person-priya', 'ClinicalResearchAssociate');
const cdm = as('person-ben', 'ClinicalDataManager');

async function reasons(promise: Promise<unknown>): Promise<string[]> {
  try {
    await promise;
  } catch (error) {
    if (error instanceof GatewayError) return error.reasons;
    throw error;
  }
  throw new Error('Expected the gateway to refuse');
}

describe('the Clinical Research Coordinator', () => {
  it('completes a visit, and it leaves their To do', async () => {
    const g = withSeed();
    await g.commit(crc, 'V-01-3', ls('CompleteVisit'));
    expect(g.read(crc, 'V-01-3').state.Status).toBe('completed');
    expect((await g.todo(crc)).map((i) => i.object.identifier)).not.toContain('V-01-3');
  });

  it('records a missed visit with its reason', async () => {
    const g = withSeed();
    await g.commit(crc, 'V-02-3', ls('RecordMissedVisit'), { reason: 'The patient was travelling' });
    const visit = g.read(crc, 'V-02-3');
    expect(visit.state.Status).toBe('missed');
    expect(visit.properties['reason missed']).toBe('The patient was travelling');
  });

  it('records data at a completed visit, entered and awaiting verification', async () => {
    const g = withSeed();
    expect(await reasons(g.commit(crc, 'V-03-3', ls('RecordData'), { value: 'Heart rate 80 bpm', source: `${NS.lst}DataRecordSource-site` }))).toEqual(['The visit has not taken place']);
    const result = await g.commit(crc, 'V-01-2', ls('RecordData'), { value: 'Heart rate 80 bpm', source: `${NS.lst}DataRecordSource-device` });
    const record = g.read(cra, result.created[0]);
    expect(record.state).toEqual({ Entry: 'entered', Source: 'device' });
    expect(record.properties.value).toBe('Heart rate 80 bpm');
    expect(record.links.find((l) => l.label === 'captured at')?.objects.map((o) => o.identifier)).toEqual(['V-01-2']);
    // The monitor now has it to verify.
    expect((await g.todo(cra)).map((i) => i.object.iri)).toContain(result.created[0]);
  });

  it('records an adverse event in the site’s words; a serious one is urgent for the people who act on it', async () => {
    const g = withSeed();
    const result = await g.commit(crc, 'PT-06', ls('RecordAdverseEvent'), { verbatimTerm: 'Fainted at home', seriousness: `${NS.lst}AdverseEventSeriousness-serious` });
    const event = g.read(cdm, result.created[0]);
    expect(event.state).toEqual({ Entry: 'entered', Seriousness: 'serious', Outcome: 'ongoing', Reporting: 'not reported' });
    expect(event.properties['verbatim term']).toBe('Fainted at home');
    const forCdm = (await g.todo(cdm)).find((i) => i.object.iri === result.created[0]);
    expect(forCdm).toMatchObject({ urgency: 3, tasks: [{ label: 'Report to safety' }] });
    expect(await reasons(g.commit(crc, 'PT-12', ls('RecordAdverseEvent'), { verbatimTerm: 'x', seriousness: `${NS.lst}AdverseEventSeriousness-nonSerious` }))).toEqual(['The patient has not been randomized']);
  });
});

describe('the Clinical Research Associate', () => {
  it('verifies a data record only once every query on it is closed', async () => {
    const g = withSeed();
    // DR-005 carries Q-01, which is open.
    expect(await reasons(g.commit(cra, 'DR-005', ls('VerifyDataRecord')))).toEqual(['The record has a query that is not closed']);
    await g.commit(cra, 'DR-028', ls('VerifyDataRecord'));
    expect(g.read(cra, 'DR-028').state.Entry).toBe('verified');
    // Verified data cannot then be queried (rule 4).
    expect(await reasons(g.commit(cra, 'DR-028', ls('RaiseQuery'), { question: 'Units?' }))).toEqual(['The record is verified and cannot be queried']);
  });

  it('verifies adverse events, and cannot enter site data', async () => {
    const g = withSeed();
    await g.commit(cra, 'AE-004', ls('VerifyAdverseEvent'));
    expect(g.read(cra, 'AE-004').state.Entry).toBe('verified');
    expect((await reasons(g.commit(cra, 'V-01-3', ls('CompleteVisit'))))).toEqual(['Your role cannot run this method']);
  });
});

describe('the Clinical Data Manager', () => {
  it('re-queries an answered query, which goes back to the site', async () => {
    const g = withSeed();
    await g.commit(cdm, 'Q-04', ls('Requery'), { reason: 'The answer does not give the units' });
    expect(g.read(cdm, 'Q-04').state.Status).toBe('open');
    expect((await g.todo(crc)).find((i) => i.object.identifier === 'Q-04')?.tasks.map((t) => t.label)).toEqual(['Answer query']);
  });

  it('reconciles a reported event with its safety case, and not one without a case', async () => {
    const g = withSeed();
    await g.commit(cdm, 'AE-001', ls('ReconcileAdverseEvent'));
    expect(g.read(cdm, 'AE-001').state.Reporting).toBe('reconciled');
    expect((await reasons(g.commit(cdm, 'AE-004', ls('ReconcileAdverseEvent')))).sort()).toEqual([
      'No safety case originates from this event',
      'The event has not been reported to safety, or is already reconciled',
    ]);
  });

  it('cannot see the arm of a blinded study, like every clinical role', () => {
    const g = withSeed();
    for (const person of [crc, cra, cdm]) expect(g.read(person, 'PT-03').properties).not.toHaveProperty('assigned arm');
  });
});
