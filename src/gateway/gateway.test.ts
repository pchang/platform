// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import { NS } from '../ontology/ontology';
import { GatewayError, type Principal } from './gateway';
import { withSeed } from './node';

// Journeys run many commits, and each validates the whole graph (see the PR note on validation cost).
vi.setConfig({ testTimeout: 20_000 });

const ls = (n: string) => `${NS.ls}${n}`;
const lst = (n: string) => `${NS.lst}${n}`;
const person = (n: string) => `${NS.d}person-${n}`;
const as = (name: string, role: string): Principal => ({ person: person(name), role: ls(role) });

const ada = as('ada', 'ComputationalChemist');
const ben = as('ben', 'ClinicalDataManager');
const chloe = as('chloe', 'DrugSafetyPhysician');
const dev = as('dev', 'DrugSafetyPhysician');
const elena = as('elena', 'QualityLead');
const fixedClock = () => new Date('2026-11-09T10:00:00Z');

async function rejected(promise: Promise<unknown> | (() => unknown)) {
  try {
    await (typeof promise === 'function' ? promise() : promise);
  } catch (error) {
    expect(error).toBeInstanceOf(GatewayError);
    return (error as GatewayError).reasons;
  }
  throw new Error('expected the gateway to refuse');
}

describe('principals', () => {
  it('refuses a person acting in a role they do not hold', async () => {
    const gateway = withSeed();
    expect(await rejected(() => gateway.read(as('ada', 'QualityLead'), 'B-002'))).toEqual(['This person cannot act in this role']);
  });
});

describe('reads', () => {
  it('shows an object with its state, links and properties', () => {
    const batch = withSeed().read(elena, 'B-002');
    expect(batch.state).toEqual({ Production: 'complete', Quality: 'pending', 'Deviation risk': 'high' });
    const qualityEvents = batch.links.find((l) => l.relationship === ls('raisedOn') && l.direction === 'in');
    expect(qualityEvents).toMatchObject({ label: 'has', kind: 'contains', one: false, typeLabel: 'Quality Event' });
    expect(qualityEvents?.objects.map((o) => o.identifier)).toEqual(['QE-1']);
  });

  describe('relationship ends (spec 3.1 and 5.1, Within an object)', () => {
    const ends = (view: { links: { relationship: string; direction: string; label: string; kind: string; one: boolean; pluralLabel: string; objects: { identifier: string }[] }[] }) =>
      view.links.map((l) => [l.label, l.pluralLabel, l.kind, l.one ? 'one' : 'many', l.objects.map((o) => o.identifier).join(' ')]);

    it('gives a study its patients first, as contained, then the sites it runs at and the formulation it tests', () => {
      expect(ends(withSeed().read(ben, 'ST-01'))).toEqual([
        ['enrolls', 'Patients', 'contains', 'many', 'PT-01 PT-02 PT-03 PT-04 PT-05 PT-06 PT-07 PT-08 PT-09 PT-10 PT-11 PT-12'],
        ['tests', 'Formulations', 'related', 'many', 'F-101'],
        ['runs at', 'Sites', 'related', 'many', 'SITE-1 SITE-2 SITE-3'],
      ]);
    });

    it('gives a patient its visits and adverse events, and the one study it is part of', () => {
      const patient = withSeed().read(ben, 'PT-03');
      const view = Object.fromEntries(ends(patient).map(([label, plural, kind, count, ids]) => [`${label} ${plural}`, `${kind} ${count}: ${ids}`]));
      expect(view['enrolled in Studies']).toBe('partOf one: ST-01');
      expect(view['enrolled at Sites']).toBe('related one: SITE-3');
      expect(view['has Visits']).toMatch(/^contains many: V-03/);
      expect(view['experienced Adverse Events']).toMatch(/^contains many/);
      // Contained ends come first, in the ontology's order.
      expect(patient.links.findIndex((l) => l.kind !== 'contains')).toBe(patient.links.filter((l) => l.kind === 'contains').length);
    });

    it('keeps an end with nothing at the other end, so every object of a type has the same structure', () => {
      const site = withSeed().read(ben, 'SITE-1');
      expect(ends(site).map(([label, plural]) => `${label} ${plural}`)).toEqual(['hosts Studies', 'enrolls Patients']);
      expect(withSeed().read(elena, 'QE-1').links.find((l) => l.relationship === ls('resolves'))).toMatchObject({ label: 'is resolved by', kind: 'contains', objects: [] });
    });

    it('reads a relationship from a type to itself both ways', () => {
      const compound = withSeed().read(ada, 'C-101');
      expect(compound.links.filter((l) => l.relationship === ls('derivedFrom')).map((l) => [l.direction, l.label, l.one])).toEqual([
        ['out', 'derived from', true],
        ['in', 'is the source of', false],
      ]);
    });

    it('leaves out ends that reach a type the role may not read, in reads and in describing the ontology', () => {
      const gateway = withSeed();
      expect(gateway.read(ada, 'B-002').links.map((l) => l.pluralLabel)).not.toContain('Patients');
      expect(gateway.describe(ada).find((t) => t.label === 'Batch')?.relationships.map((r) => r.pluralLabel)).not.toContain('Patients');
      expect(gateway.describe(ben).find((t) => t.label === 'Study')?.relationships.map((r) => `${r.label} ${r.pluralLabel}`)).toEqual([
        'enrolls Patients',
        'tests Formulations',
        'runs at Sites',
      ]);
    });

    it('says who last changed an object, with which method and when', async () => {
      const gateway = withSeed([], { now: fixedClock });
      expect(gateway.read(chloe, 'SC-004').lastChange).toBeUndefined();
      await gateway.commit(chloe, 'SC-004', ls('Triage'), { seriousness: lst('SafetyCaseSeriousness-serious'), expectedness: lst('SafetyCaseExpectedness-unexpected') });
      expect(gateway.read(chloe, 'SC-004').lastChange).toMatchObject({ methodLabel: 'Triage', personName: 'Chloé Martin', at: '2026-11-09T10:00:00Z' });
    });
  });

  it('never shows the Computational Chemist patient-level data', async () => {
    const gateway = withSeed();
    expect(await rejected(() => gateway.read(ada, 'PT-03'))).toEqual(['Your role cannot read this object']);
    expect(gateway.describe(ada).map((t) => t.label)).not.toContain('Patient');
    const batch = gateway.read(ada, 'B-002');
    expect(batch.links.some((l) => l.label === 'receives')).toBe(false);
  });

  it('hides a patient’s arm while it is hidden (rule 2), and never shows it to the Clinical Data Manager', () => {
    const gateway = withSeed();
    expect(gateway.read(chloe, 'PT-03').properties).not.toHaveProperty('assigned arm');
    expect(gateway.read(ben, 'PT-03').properties).not.toHaveProperty('assigned arm');
  });

  it('records every read of personal data in the audit trail', () => {
    const gateway = withSeed();
    gateway.read(ben, 'PT-03');
    gateway.read(elena, 'B-002');
    expect(gateway.reads().map((r) => [r.person, r.object])).toEqual([[person('ben'), `${NS.d}PT-03`]]);
  });

  it('finds objects by type and state', () => {
    const open = withSeed().find(ben, ls('DataQuery'), { [ls('dataQueryStatus')]: lst('DataQueryStatus-open') });
    expect(open.map((q) => q.identifier)).toEqual(['Q-01', 'Q-02', 'Q-03']);
  });
});

describe('J1 through the gateway: from trial adverse event to expedited report', () => {
  it('runs end to end, with the unblinding edge case and separation of duties', async () => {
    const gateway = withSeed([], { now: fixedClock, developmentSignatures: true });

    // Clinical Data Manager: report the serious event to safety.
    const reported = await gateway.commit(ben, 'AE-003', ls('ReportToSafety'));
    expect(reported.created).toHaveLength(1);
    const caseId = gateway.read(chloe, reported.created[0]).identifier;
    expect(gateway.read(chloe, caseId)).toMatchObject({ state: { Workflow: 'received', Causality: 'unassessed' }, properties: { 'received on': '2026-11-09' } });
    expect(gateway.read(ben, 'AE-003').state.Reporting).toBe('reported to safety');

    // Drug Safety Physician: unblinding is blocked until the case is triaged as serious and unexpected.
    const blocked = (await gateway.methods(chloe, 'PT-03')).find((m) => m.label === 'Unblind patient');
    expect(blocked?.blocks).toContain('Rule 2: unblinding needs a triaged safety case for this patient that is serious and unexpected');
    await gateway.commit(chloe, caseId, ls('Triage'), { seriousness: lst('SafetyCaseSeriousness-serious'), expectedness: lst('SafetyCaseExpectedness-unexpected') });
    await gateway.commit(chloe, 'PT-03', ls('UnblindPatient'), { justification: 'Arm needed to assess causality for an expedited report' });
    expect(gateway.read(chloe, 'PT-03').properties['assigned arm']).toBe('A');
    expect(gateway.read(ben, 'PT-03').properties).not.toHaveProperty('assigned arm');

    // Assess, then prepare the expedited report, due 15 days after receipt (rule 1).
    expect(await rejected(gateway.commit(chloe, caseId, ls('Assess'), { causality: lst('SafetyCaseCausality-unassessed') }))).toEqual([
      'Causality must be assessed as unrelated, possible or probable',
    ]);
    await gateway.commit(chloe, caseId, ls('Assess'), { causality: lst('SafetyCaseCausality-probable') });
    const prepared = await gateway.commit(chloe, caseId, ls('PrepareExpeditedReport'));
    const submission = prepared.created[0];
    expect(gateway.read(chloe, submission)).toMatchObject({ state: { Status: 'draft', Deadline: 'on track' }, properties: { 'due on': '2026-11-24', 'prepared by': 'Chloé Martin' } });

    // Rule 5: the preparer cannot approve; a second physician can.
    await gateway.commit(chloe, submission, ls('SendForReview'), { reviewer: person('dev') });
    expect(await rejected(gateway.commit(chloe, submission, ls('Submit'), { approver: person('chloe') }))).toEqual([
      'Approver must be someone else (rule 5: separation of duties)',
    ]);
    const submitted = await gateway.commit(dev, submission, ls('Submit'), { approver: person('dev') }, { typedName: 'Dev Raman' });
    expect(submitted.signature).toMatchObject({ signerName: 'Dev Raman', development: true, meaning: 'Approval: I approve this report for submission to the regulatory authority.' });
    expect(gateway.read(dev, caseId).state.Workflow).toBe('reported');
    expect(submitted.changes).toContainEqual(expect.objectContaining({ subject: reported.created[0], property: ls('safetyCaseWorkflow'), oldValue: lst('SafetyCaseWorkflow-assessed'), newValue: lst('SafetyCaseWorkflow-reported') }));

    // Every step is in the history, with who did it and in which role.
    expect(gateway.commits().map((c) => [c.method.split('#')[1], c.person.split('/').pop()])).toEqual([
      ['ReportToSafety', 'person-ben'],
      ['Triage', 'person-chloe'],
      ['UnblindPatient', 'person-chloe'],
      ['Assess', 'person-chloe'],
      ['PrepareExpeditedReport', 'person-chloe'],
      ['SendForReview', 'person-chloe'],
      ['Submit', 'person-dev'],
    ]);
  });
});

describe('J3 through the gateway: from manufacturing deviation to quarantine', () => {
  it('blocks release, quarantines the batch, and investigates the quality event', async () => {
    const gateway = withSeed();
    const release = (await gateway.methods(elena, 'B-002')).find((m) => m.label === 'Release batch');
    expect(release).toMatchObject({ available: false, blocks: ['An open quality event is raised on this batch'] });
    expect(await rejected(gateway.commit(elena, 'B-002', ls('ReleaseBatch'), { reviewer: person('elena') }))).toEqual(['An open quality event is raised on this batch']);

    await gateway.commit(elena, 'B-002', ls('QuarantineBatch'), { reason: 'High deviation risk under investigation' });
    expect(gateway.read(elena, 'B-002').state.Quality).toBe('quarantined');
    await gateway.commit(elena, 'QE-1', ls('StartInvestigation'), { investigator: person('elena') });
    const assigned = await gateway.commit(elena, 'QE-1', ls('AssignCAPA'), { owner: person('elena'), action: 'Requalify the fill line' });
    expect(gateway.read(elena, assigned.created[0]).state.Status).toBe('planned');
    expect(gateway.read(elena, 'QE-1').state.Status).toBe('CAPA assigned');
  });
});

describe('commits', () => {
  it('refuse a role that may not run the method', async () => {
    expect(await rejected(withSeed().commit(ada, 'B-002', ls('QuarantineBatch'), { reason: 'x' }))).toEqual(['Your role cannot run this method']);
  });

  it('refuse missing, unknown and wrong-kind inputs, naming each problem', async () => {
    const gateway = withSeed();
    expect(await rejected(gateway.commit(elena, 'B-002', ls('QuarantineBatch'), {}))).toEqual(['Reason is required']);
    expect(await rejected(gateway.commit(elena, 'QE-1', ls('StartInvestigation'), { investigator: 'B-001', color: 'red' }))).toEqual([
      'Unknown input color',
      'Investigator is not a known person',
    ]);
  });

  it('undo everything when the result breaks a shape', async () => {
    // A stricter rule for this test only: every new safety case must name a batch. Report to safety
    // does not set one, so the commit breaks the shape after its effects are applied (step 5).
    const scoped = withSeed([`@prefix sh: <http://www.w3.org/ns/shacl#> . @prefix ls: <${NS.ls}> .
      <urn:test:shape> a sh:NodeShape ; sh:targetNode <${NS.d}SafetyCase-27> ; sh:property <urn:test:p> .
      <urn:test:p> sh:path ls:mayInvolve ; sh:minCount 1 ; sh:message "Every case must name a batch" .`]);
    // The shape targets only the case this commit creates, so the seed itself conforms.
    const before = scoped.find(chloe, ls('SafetyCase')).length;
    const reasons = await rejected(scoped.commit(ben, 'AE-003', ls('ReportToSafety')));
    expect(reasons.join()).toContain('Every case must name a batch');
    expect(scoped.read(ben, 'AE-003').state.Reporting).toBe('not reported');
    expect(scoped.find(chloe, ls('SafetyCase'))).toHaveLength(before);
    expect(scoped.commits()).toEqual([]);

    // Control: without the stricter rule, the same commit succeeds and creates exactly that case.
    expect((await withSeed().commit(ben, 'AE-003', ls('ReportToSafety'))).created).toEqual([`${NS.d}SafetyCase-27`]);
  });

  it('record described effects as pending work', async () => {
    const gateway = withSeed();
    const result = await gateway.commit(chloe, 'SIG-1', ls('EvaluateSignal'));
    expect(result.pending).toEqual([]);
    const confirm = await gateway.commit(chloe, 'SIG-1', ls('ConfirmSignal'), { rationale: 'Three related cases' });
    expect(confirm.pending).toEqual([ls('ConfirmSignal-effect2')]);
  });
});
