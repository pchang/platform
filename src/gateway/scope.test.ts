// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import { NS, select } from '../ontology/ontology';
import { withSeed } from './node';
import { GatewayError, type Gateway } from './gateway';

// Scope (platform spec 3.3) and what an agent reads (platform spec 3.4, Outside agents; domain spec section 6): Northbridge
// CRO is assigned to the Phase II study at its first two sites, so the third site's work does not exist for its agent.
vi.setConfig({ testTimeout: 60_000 });

const ls = (n: string) => `${NS.ls}${n}`;
const agent = { person: `${NS.d}agent-northbridge`, role: ls('ExternalCROAgent') };
const mira = { person: `${NS.d}person-mira`, role: ls('CRODataManager') };
const sam = { person: `${NS.d}person-sam`, role: ls('ClinicalResearchCoordinator') };
const priya = { person: `${NS.d}person-priya`, role: ls('ClinicalResearchAssociate') };
const ben = { person: `${NS.d}person-ben`, role: ls('ClinicalDataManager') };

const storeOf = (g: Gateway) => (g as unknown as { graph: { store: Parameters<typeof select>[0] & { update(q: string): void } } }).graph.store;
const ids = (objects: { identifier: string }[]) => objects.map((o) => o.identifier);

function refusal(run: () => unknown): { status: number; reasons: string } {
  try {
    run();
  } catch (error) {
    if (error instanceof GatewayError) return { status: error.status, reasons: error.reasons.join(' ') };
    throw error;
  }
  return { status: 0, reasons: '' };
}

describe('out of scope is invisible', () => {
  it('lists, counts and reads only the queries at Northbridge’s two sites', async () => {
    const g = withSeed();
    expect(ids(g.find(agent, ls('DataQuery')))).toEqual(['Q-01', 'Q-03', 'Q-04', 'Q-05', 'Q-06', 'Q-07', 'Q-08']);
    // Q-02 is at the third site: not forbidden, simply not there.
    expect(refusal(() => g.read(agent, 'Q-02'))).toEqual({ status: 404, reasons: 'No object Q-02' });
    const queries = g.navigation(agent).flatMap((d) => d.types).find((t) => t.type === ls('DataQuery'));
    expect(queries?.count).toBe(7);
    expect((await g.home(agent)).metrics.find((m) => m.label === 'Open data queries')).toMatchObject({ count: 2, total: 7 });
    expect(ids((await g.search(agent, 'open data queries')).results.map((r) => r.object))).toEqual(['Q-01', 'Q-03']);
    expect((await g.todo(agent)).map((i) => i.object.identifier)).not.toContain('Q-02');
  });

  it('links only to what is in scope: the study shows its patients at the two sites', () => {
    const g = withSeed();
    const patients = g.read(agent, 'ST-01').links.find((l) => l.type === ls('Patient'))!;
    expect(patients.objects.length).toBe(8);
    expect(g.read(ben, 'ST-01').links.find((l) => l.type === ls('Patient'))!.objects.length).toBe(12);
  });

  it('cannot act on what it cannot see', async () => {
    const g = withSeed();
    await expect(g.commit({ ...agent, reason: 'Confirmed with the site' }, 'Q-02', ls('AnswerQuery'), { answer: 'Confirmed against source.' })).rejects.toMatchObject({ status: 404 });
  });

  it('limits the site staff to their own sites, and leaves everyone else as they were', () => {
    const g = withSeed();
    const sites = (principal: typeof sam) => ids(g.find(principal, ls('Site'))).filter((id) => ['SITE-1', 'SITE-2', 'SITE-3'].includes(id));
    expect(sites(sam)).toEqual(['SITE-1']);
    expect(sites(priya)).toEqual(['SITE-1', 'SITE-2']);
    expect(sites(mira)).toEqual(['SITE-1', 'SITE-2']);
    expect(sites(ben)).toEqual(['SITE-1', 'SITE-2', 'SITE-3']);
    expect(g.find(sam, ls('Patient')).length).toBe(4);
    expect(g.find(ben, ls('Patient')).length).toBe(12);
  });

  it('ends with the assignment: after its last day, nothing in scope is left', () => {
    const g = withSeed([], { now: () => new Date('2027-02-01T09:00:00Z') });
    storeOf(g).update(`INSERT DATA { <${NS.d}ASG-1> <${NS.p}assignedUntil> "2027-01-31"^^<${NS.xsd}date> }`);
    expect(g.find(agent, ls('DataQuery'))).toEqual([]);
    expect(refusal(() => g.read(agent, 'Q-01')).status).toBe(404);
  });
});

describe('an agent reads only what its role lists', () => {
  it('knows only the types answering a query needs', () => {
    const g = withSeed();
    expect(g.describe(agent).map((t) => t.label).sort()).toEqual(['Data Query', 'Data Record', 'Patient', 'Site', 'Study', 'Visit']);
    expect(refusal(() => g.find(agent, ls('AdverseEvent'))).status).toBe(404);
    expect(refusal(() => g.read(agent, 'C-101')).status).toBe(404);
    // A patient by study code; never the assigned arm.
    expect(Object.keys(g.read(agent, 'PT-01').properties)).not.toContain('assigned arm');
  });
});

describe('an agent is not a person', () => {
  it('is not offered where people are chosen, such as the people one may act as', () => {
    const g = withSeed();
    expect(g.people().map((p) => p.name)).not.toContain('Northbridge query agent');
    expect(g.people().map((p) => p.name)).toContain('Mira Castellanos');
  });

  it('acts only while active, and says why not', () => {
    for (const [status, reason] of [
      ['registered', 'registered and not yet approved by the sponsor'],
      ['suspended', 'suspended: Contract under review'],
      ['paused', 'paused: More than 60 commits in an hour. A person must resume it.'],
      ['retired', 'retired'],
    ]) {
      const g = withSeed();
      storeOf(g).update(`DELETE { ?a <${NS.p}agentStatus> ?s } INSERT { ?a <${NS.p}agentStatus> <${NS.p}AgentStatus-${status}> } WHERE { BIND(<${agent.person}> AS ?a) ?a <${NS.p}agentStatus> ?s }`);
      if (status === 'suspended') storeOf(g).update(`INSERT DATA { <${agent.person}> <${NS.p}statusReason> "Contract under review" }`);
      if (status === 'paused') storeOf(g).update(`INSERT DATA { <${agent.person}> <${NS.p}statusReason> "More than 60 commits in an hour" }`);
      expect(refusal(() => g.find(agent, ls('DataQuery'))), status).toEqual({ status: 403, reasons: `This agent is ${reason}` });
    }
  });
});

describe('who grants scope (platform spec 3.3, Who grants it; domain spec section 6, Assignments)', () => {
  const marcus = { person: `${NS.d}person-marcus`, role: ls('ClinicalOperationsLead') };

  it('the Clinical Operations Lead assigns an organization, from its contract, then widens the assignment a root at a time', async () => {
    const g = withSeed();
    const org = await g.create(marcus, `${NS.p}Organization`, { organizationName: 'Harbourline Research' });
    const form = g.createForm(marcus, `${NS.p}Assignment`);
    expect(form.fields.map((f) => [f.name, f.required])).toEqual([['assignee', true], ['assignedFrom', true], ['assignedUntil', false], ['contractReference', false], ['contractDate', false]]);
    // People are offered by name beside organizations.
    expect(form.fields[0].choices?.map((c) => c.label)).toEqual(expect.arrayContaining(['ORG-1 · Northbridge CRO', 'Sam Whitfield']));

    // An organization's assignment must name its contract.
    await expect(g.create(marcus, `${NS.p}Assignment`, { assignee: org.created[0], assignedFrom: '2026-11-01' })).rejects.toMatchObject({
      reasons: [expect.stringContaining('An assignment to an organization names the contract it comes from, by reference and date')],
    });
    const assignment = (await g.create(marcus, `${NS.p}Assignment`, { assignee: org.created[0], assignedFrom: '2026-11-01', contractReference: 'HR-2026-003', contractDate: '2026-10-20' })).created[0];
    await g.commit(marcus, assignment, ls('CoverStudy'), { study: `${NS.d}ST-01` });
    await g.commit(marcus, assignment, ls('CoverSite'), { site: `${NS.d}SITE-3` });
    expect(g.read(marcus, assignment).links.find((l) => l.label === 'covers' && l.type === ls('Site'))?.objects.map((o) => o.identifier)).toEqual(['SITE-3']);
  });

  it('ends an assignment with a reason, and the organization’s agent loses the access at once', async () => {
    const g = withSeed([], { now: () => new Date('2026-11-26T09:00:00Z') });
    expect(g.find(agent, ls('DataQuery')).length).toBe(7);
    await g.commit(marcus, 'ASG-1', `${NS.p}EndAssignment`, { lastDay: '2026-11-25', reason: 'Contract NB-2026-014 terminated' });
    expect(g.read(marcus, 'ASG-1').properties).toMatchObject({ until: '2026-11-25', 'why it ended': 'Contract NB-2026-014 terminated' });
    expect(g.find(agent, ls('DataQuery'))).toEqual([]);
  });

  it('is never done by an agent, nor by roles that do not manage assignments', async () => {
    const g = withSeed();
    await expect(g.commit(sam, 'ASG-2', ls('CoverSite'), { site: `${NS.d}SITE-2` })).rejects.toMatchObject({ reasons: ['Your role cannot run this method'] });
    await expect(Promise.resolve().then(() => g.createForm(mira, `${NS.p}Assignment`))).rejects.toMatchObject({ status: 403 });
  });
});
