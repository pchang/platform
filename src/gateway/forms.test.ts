// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import { NS } from '../ontology/ontology';
import { withSeed } from './node';
import { GatewayError } from './gateway';

// Creating and editing objects (platform spec 5.3; domain spec section 6, Creating and editing).
vi.setConfig({ testTimeout: 60_000 });

const ls = (n: string) => `${NS.ls}${n}`;
const lst = (n: string) => `${NS.lst}${n}`;
const as = (person: string, role: string) => ({ person: `${NS.d}${person}`, role: ls(role) });
const nadia = as('person-nadia', 'ClinicalScientist');
const marcus = as('person-marcus', 'ClinicalOperationsLead');
const ben = as('person-ben', 'ClinicalDataManager');
const priya = as('person-priya', 'ClinicalResearchAssociate');
const ada = as('person-ada', 'ComputationalChemist');

async function reasons(run: () => unknown): Promise<string> {
  try {
    await run();
  } catch (error) {
    if (error instanceof GatewayError) return error.reasons.join(' ');
    throw error;
  }
  return '';
}

describe('who may create', () => {
  it('is a permission of the role, offered on the type in navigation', () => {
    const g = withSeed();
    const types = (who: typeof nadia) => g.navigation(who).flatMap((d) => d.types).filter((t) => t.creatable).map((t) => t.label);
    expect(types(ben)).toEqual(expect.arrayContaining(['Protocol', 'Site', 'Study']));
    expect(types(priya)).toEqual([]);
  });

  it('never covers a type that comes only through methods, whatever the role', async () => {
    const g = withSeed();
    expect(await reasons(() => g.createForm(ben, ls('DataRecord')))).toContain('only through the methods');
    expect(await reasons(() => g.createForm(marcus, ls('Forecast')))).toContain('only through the methods');
    expect(await reasons(() => g.createForm(priya, ls('Study')))).toContain('cannot create');
  });
});

describe('the minimal form', () => {
  it('asks for the parent, the title’s properties and the classifying states first, the rest as optional', () => {
    const g = withSeed();
    const form = g.createForm(nadia, ls('Endpoint'));
    const required = form.fields.filter((f) => f.required).map((f) => `${f.label}: ${f.kind}`);
    expect(required).toEqual(['Objective: object', 'Statement: line', 'Type: choice']);
    // A lifecycle is never asked for; an objective's level is classifying, an endpoint's type too.
    expect(g.createForm(nadia, ls('StudyConcept')).fields.map((f) => f.label)).not.toContain('Status');
    expect(form.fields.filter((f) => !f.required).map((f) => f.label)).toEqual([]);
  });

  it('gives numbers, dates and links their own kinds', () => {
    const g = withSeed();
    const fields = Object.fromEntries(g.createForm(marcus, ls('ProposedSite')).fields.map((f) => [f.label, `${f.kind}${f.required ? '!' : ''}`]));
    expect(fields).toMatchObject({ 'Site Selection': 'object!', Site: 'object!', Status: 'choice!', 'Patients per month': 'number', 'Site count': 'number' });
    // Three links of a study scenario, each named by the type it reaches.
    expect(g.createForm(nadia, ls('StudyScenario')).fields.filter((f) => f.kind === 'object').map((f) => f.label).sort()).toEqual(['Explores', 'Protocol', 'Site Selection', 'Study Budget']);
  });
});

describe('creating', () => {
  it('creates an object with its lifecycle at its first value, recorded as a Create commit', async () => {
    const g = withSeed();
    // A study concept belongs to a program or an opportunity, so the form requires one.
    expect(await reasons(() => g.create(nadia, ls('StudyConcept'), { studyConceptName: 'VELOCITY-4: long-term extension' }))).toContain('Is proposed for is required');
    const result = await g.create(nadia, ls('StudyConcept'), { studyConceptName: 'VELOCITY-4: long-term extension', conceptRationale: 'Durability to Week 104', proposedFor: `${NS.d}PRG-1` });
    const concept = g.read(nadia, result.created[0]);
    expect(concept.title).toBe('VELOCITY-4: long-term extension');
    expect(Object.values(concept.state)).toEqual(['draft']);
    expect(concept.lastChange).toMatchObject({ methodLabel: 'Create', personName: 'Nadia Haddad' });
  });

  it('creates inside a parent from its tab, which a contained type requires', async () => {
    const g = withSeed();
    expect(await reasons(() => g.create(nadia, ls('EligibilityCriterion'), { criterionText: 'Adults', eligibilityCriterionKind: lst('EligibilityCriterionKind-inclusion'), eligibilityCriterionTestability: lst('EligibilityCriterionTestability-testable') }))).toContain('Population is required');
    const population = g.read(nadia, 'POP-1');
    expect(population.links.find((l) => l.relationship === ls('defines'))!.canAdd).toBe(true);
    const form = g.createForm(nadia, ls('EligibilityCriterion'), 'POP-1');
    expect(form.parent!.identifier).toBe('POP-1');
    expect(form.fields.map((f) => f.label)).not.toContain('Defines');
    const preview = await g.previewCreate(nadia, ls('EligibilityCriterion'), { criterionText: 'Body mass index 18 to 40', eligibilityCriterionKind: lst('EligibilityCriterionKind-inclusion'), eligibilityCriterionTestability: lst('EligibilityCriterionTestability-testable') }, 'POP-1');
    expect(preview.changes.map((c) => c.propertyLabel)).toContain('defines');
    const result = await g.create(nadia, ls('EligibilityCriterion'), { criterionText: 'Body mass index 18 to 40', eligibilityCriterionKind: lst('EligibilityCriterionKind-inclusion'), eligibilityCriterionTestability: lst('EligibilityCriterionTestability-testable') }, 'POP-1');
    expect(g.read(nadia, 'POP-1').links.find((l) => l.relationship === ls('defines'))!.objects.map((o) => o.iri)).toContain(result.created[0]);
  });

  it('refuses what the fields do not allow', async () => {
    const g = withSeed();
    expect(await reasons(() => g.create(marcus, ls('Site'), {}))).toContain('Name is required');
    expect(await reasons(() => g.create(marcus, ls('ProposedSite'), { proposedIn: `${NS.d}SS-1`, candidateSite: `${NS.d}SITE-1`, proposedSiteStatus: lst('ProposedSiteStatus-proposed'), patientsPerMonth: 'many' }))).toContain('must be a number');
    expect(await reasons(() => g.create(marcus, ls('Site'), { siteName: 'X', sitePayment: 'whatever' }))).toContain('not one of the allowed choices');
  });
});

describe('editing', () => {
  it('changes properties and classifying states, never lifecycles, as an Edit commit', async () => {
    const g = withSeed();
    const form = await g.editForm(nadia, 'OBJ-2');
    expect(form.fields.find((f) => f.label === 'Statement')!.value).toBe('Compare disease activity and physical function at Week 24');
    expect(form.fields.map((f) => f.label)).not.toContain('Specified in');
    await g.edit(nadia, 'OBJ-2', { objectiveText: 'Compare disease activity at Week 24', objectiveLevel: lst('ObjectiveLevel-primary') });
    const objective = g.read(nadia, 'OBJ-2');
    expect(objective.title).toBe('Compare disease activity at Week 24');
    expect(objective.lastChange).toMatchObject({ methodLabel: 'Edit' });
    expect(await reasons(() => g.edit(nadia, 'OBJ-2', { objectiveText: 'Compare disease activity at Week 24' }))).toContain('Nothing has changed');
  });

  it('refuses a frozen record, with the rule that freezes it', async () => {
    const g = withSeed();
    // PROT-2 is approved: rule 4. PROT-3 is a draft.
    expect(await g.editBlocks(ben, 'PROT-2')).toEqual([expect.stringContaining('cannot be edited (Data integrity)')]);
    expect(await g.editBlocks(ben, 'PROT-3')).toEqual([]);
    expect(await reasons(() => g.edit(ben, 'PROT-2', { protocolName: 'Renamed' }))).toContain('Data integrity');
    expect(await g.editBlocks(ada, 'EXP-1')).toEqual([expect.stringContaining('Signed experiment')]);
  });

  it('refuses roles and types that may not be edited', async () => {
    const g = withSeed();
    expect(await g.editBlocks(priya, 'ST-01')).toEqual(['Your role cannot edit objects of this type']);
    expect(await g.editBlocks(ben, 'DR-003')).toEqual(['Objects of this type change only through their methods']);
  });
});
