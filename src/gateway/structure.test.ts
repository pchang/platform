// @vitest-environment node
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { NS, select } from '../ontology/ontology';
import { openGateway, withSeed } from './node';
import { GatewayError, type Gateway } from './gateway';

// Structure evolution (platform spec 3.7) and journey J7, Evolving the structure (domain spec section 10).
vi.setConfig({ testTimeout: 120_000 });

const p = (n: string) => `${NS.p}${n}`;
const ls = (n: string) => `${NS.ls}${n}`;
const noor = { person: `${NS.d}person-noor`, role: p('StructureSteward') };
const marcus = { person: `${NS.d}person-marcus`, role: ls('ClinicalOperationsLead') };
const ben = { person: `${NS.d}person-ben`, role: ls('ClinicalDataManager') };

async function reasons(promise: Promise<unknown>): Promise<string> {
  try {
    await promise;
  } catch (error) {
    if (error instanceof GatewayError) return error.reasons.join(' ');
    throw error;
  }
  return '';
}

const storeOf = (g: Gateway) => (g as unknown as { graph: { store: Parameters<typeof select>[0] } }).graph.store;

/** The Steward drafts a change set with one operation, adding "on hold" to study scenarios' status. */
async function draftOnHold(g: Gateway) {
  const created = await g.create(noor, p('ChangeSet'), { changeSummary: 'Study scenarios can wait on a budget decision: add an on hold status' });
  const changeSet = created.created[0];
  await g.commit(noor, changeSet, p('AddValue'), { valueSet: 'StudyScenarioStatus', label: 'on hold' });
  return changeSet;
}

const scenarioStages = async (g: Gateway) => (await g.read(marcus, 'SSC-1')).lifecycle?.stages;

describe('the structure describes itself (platform spec 3.7)', () => {
  it('gives the Steward a Structure world to browse, and no type that holds personal data', async () => {
    const g = withSeed();
    const structure = (await g.navigation(noor)).find((d) => d.label === 'Structure');
    expect(structure?.types.map((t) => t.label)).toEqual(expect.arrayContaining(['Change Set', 'Object Type', 'Value Set', 'Method', 'Role', 'Skill', 'Metric']));
    // The ontology's own resources are its objects, identified by name.
    const type = g.read(noor, 'StudyScenario');
    expect(type).toMatchObject({ typeLabel: 'Object Type', title: 'Study Scenario' });
    expect(type.links.map((l) => l.label)).toEqual(expect.arrayContaining(['has']));
    const status = g.read(noor, 'StudyScenarioStatus');
    expect(status.title).toBe('Study Scenario status');
    expect(status.links.find((l) => l.label === 'holds')?.objects.map((o) => o.title)).toEqual(['Draft', 'Selected', 'Set aside']);
    // A patient holds personal health data, so the Steward cannot read one.
    expect(() => g.read(noor, 'PT-03')).toThrow();
    expect((await g.home(noor)).metrics.map((m) => m.label)).toEqual(expect.arrayContaining(['Change sets awaiting approval', 'Deprecated values', 'Change sets applied']));
  });
});

describe('J7: evolving the structure', () => {
  it('drafts a change set, shows its impact, waits for an owner, applies it and rolls it back', async () => {
    const g = withSeed();
    const changeSet = await draftOnHold(g);
    const cs = g.read(noor, changeSet);
    expect(cs.state).toMatchObject({ Status: 'draft' });
    expect(cs.links.find((l) => l.label === 'is made of')?.objects.map((o) => o.title)).toEqual(['Add value: on hold in Study Scenario status']);

    // Its impact: what changes, no object moves, nothing stops conforming, and what refers to the statuses.
    const preview = await g.preview(noor, changeSet, p('ProposeChangeSet'));
    expect(preview.impact).toMatchObject({ structure: ['Study Scenario status: adds on hold'], moves: [], notConforming: [] });
    expect(preview.impact!.refersTo).toEqual(expect.arrayContaining([
      'Method Compare study scenarios: its precondition allows only some of these values',
      'State Status of Study Scenario: wherever its values are shown or chosen',
    ]));
    expect(preview.impact!.versions).toEqual(['LS&H life sciences terms 0.2.0 → 0.3.0']);
    await g.commit(noor, changeSet, p('ProposeChangeSet'));

    // It waits on To do for the owners of study scenarios, not for the Steward who drafted it, nor for other roles.
    expect((await g.todo(marcus)).find((i) => i.object.iri === changeSet)?.tasks.map((t) => t.label)).toEqual(['Approve']);
    expect((await g.todo(ben)).find((i) => i.object.iri === changeSet)).toBeUndefined();
    expect(await reasons(g.commit(noor, changeSet, p('ApproveChangeSet')))).toContain('You drafted this change set');
    expect(await reasons(g.commit(ben, changeSet, p('ApproveChangeSet')))).toMatch(/^Only an owner of Study Scenario status may decide on this: .*Clinical Operations Lead/);
    await g.commit(marcus, changeSet, p('ApproveChangeSet'));

    // Applied: a new version, and the new status wherever study scenarios' statuses appear, from the next request on.
    expect(await scenarioStages(g)).toEqual(['draft', 'selected', 'set aside']);
    const applied = await g.commit(noor, changeSet, p('ApplyChangeSet'));
    expect(applied.changes.some((c) => c.newLabel === 'applied')).toBe(true);
    expect(await scenarioStages(g)).toEqual(['draft', 'selected', 'set aside', 'on hold']);
    const after = g.read(noor, changeSet);
    expect(after.state).toMatchObject({ Status: 'applied' });
    expect(after.properties.version).toBe('LS&H life sciences terms 0.2.0 → 0.3.0');
    expect(after.properties['Turtle patch']).toContain('<https://w3id.org/lsh-platform/life-sciences/term#StudyScenarioStatus-onHold> <http://www.w3.org/2004/02/skos/core#prefLabel> "on hold" .');
    // The shape that allows each status now allows it too, so a scenario could hold it.
    expect(select(storeOf(g), `SELECT ?v WHERE { <${NS.lsh}StudyScenario-studyScenarioStatus> sh:in/rdf:rest*/rdf:first ?v }`).map((r) => r.v)).toContain(`${NS.lst}StudyScenarioStatus-onHold`);

    // Rolled back as a new change: the status goes, and so does the version.
    const back = await g.preview(noor, changeSet, p('RollBackChangeSet'));
    expect(back.impact).toMatchObject({ structure: ['Study Scenario status: removes on hold'], notConforming: [], versions: ['LS&H life sciences terms 0.3.0 → 0.2.0'] });
    await g.commit(noor, changeSet, p('RollBackChangeSet'));
    expect(await scenarioStages(g)).toEqual(['draft', 'selected', 'set aside']);
    expect(g.read(noor, changeSet).state).toMatchObject({ Status: 'ended', Outcome: 'rolled back' });
    expect(select(storeOf(g), `SELECT ?v WHERE { <${NS.lsh}StudyScenario-studyScenarioStatus> sh:in/rdf:rest*/rdf:first ?v }`).map((r) => r.v)).not.toContain(`${NS.lst}StudyScenarioStatus-onHold`);
  });

  it('refuses to roll back a value objects now hold', async () => {
    const g = withSeed();
    const changeSet = await draftOnHold(g);
    await g.commit(noor, changeSet, p('ProposeChangeSet'));
    await g.commit(marcus, changeSet, p('ApproveChangeSet'));
    await g.commit(noor, changeSet, p('ApplyChangeSet'));
    // A scenario put on hold, as a method that moves it there would.
    const store = storeOf(g) as unknown as { update(q: string): void };
    store.update(`DELETE { <${NS.d}SSC-2> <${ls('studyScenarioStatus')}> ?s } INSERT { <${NS.d}SSC-2> <${ls('studyScenarioStatus')}> <${NS.lst}StudyScenarioStatus-onHold> } WHERE { <${NS.d}SSC-2> <${ls('studyScenarioStatus')}> ?s }`);
    // The preview says why, as a commit would.
    expect(await reasons(g.preview(noor, changeSet, p('RollBackChangeSet')))).toBe('SSC-2 holds on hold, which rolling back would remove. Move it first.');
    expect(await reasons(g.commit(noor, changeSet, p('RollBackChangeSet')))).toContain('SSC-2 holds on hold');
  });

  it('relabels a value: its address stays, and it reads the new way everywhere', async () => {
    const g = withSeed();
    const { created } = await g.create(noor, p('ChangeSet'), { changeSummary: 'Teams say parked, not set aside' });
    await g.commit(noor, created[0], p('RelabelValue'), { value: 'StudyScenarioStatus-setAside', label: 'parked' });
    const impact = (await g.preview(noor, created[0], p('ProposeChangeSet'))).impact!;
    expect(impact.structure).toEqual(['Study Scenario status: relabels set aside as parked']);
    expect(impact.versions).toEqual(['LS&H life sciences terms 0.2.0 → 0.2.1']);
    await g.commit(noor, created[0], p('ProposeChangeSet'));
    await g.commit(marcus, created[0], p('ApproveChangeSet'));
    await g.commit(noor, created[0], p('ApplyChangeSet'));
    expect(await scenarioStages(g)).toEqual(['draft', 'selected', 'parked']);
  });

  it('deprecates a value: objects holding it move to its replacement, and it is offered no more', async () => {
    const g = withSeed();
    // Comparing sets two scenarios aside.
    await g.commitSet(marcus, ['SSC-1', 'SSC-2', 'SSC-3'], ls('CompareStudyScenarios'), { chosen: 'SSC-3', rationale: 'Meets every target' });
    const { created } = await g.create(noor, p('ChangeSet'), { changeSummary: 'Set aside scenarios go back to draft' });
    expect(await reasons(g.commit(noor, created[0], p('DeprecateValue'), { value: 'ChangeSetStatus-draft', replacement: 'ChangeSetStatus-ended' }))).toContain('platform');
    await g.commit(noor, created[0], p('DeprecateValue'), { value: 'StudyScenarioStatus-setAside', replacement: 'StudyScenarioStatus-draft' });
    const impact = (await g.preview(noor, created[0], p('ProposeChangeSet'))).impact!;
    expect(impact.moves).toEqual([
      { identifier: 'SSC-1', from: 'set aside', to: 'draft' },
      { identifier: 'SSC-2', from: 'set aside', to: 'draft' },
    ]);
    await g.commit(noor, created[0], p('ProposeChangeSet'));
    await g.commit(marcus, created[0], p('ApproveChangeSet'));
    await g.commit(noor, created[0], p('ApplyChangeSet'));
    expect(g.read(marcus, 'SSC-1').state.Status).toBe('draft');
    expect(await scenarioStages(g)).toEqual(['draft', 'selected']);
    expect((await g.home(noor)).metrics.find((m) => m.label === 'Deprecated values')?.count).toBe(1);
    expect(g.read(noor, 'StudyScenarioStatus-setAside').links.find((l) => l.label === 'is replaced by')?.objects.map((o) => o.title)).toEqual(['Draft']);
  });

  it('keeps an applied change across a restart, from the journal', async () => {
    const path = join(mkdtempSync(join(tmpdir(), 'structure-')), 'journal.jsonl');
    const g = openGateway(path);
    const changeSet = await draftOnHold(g);
    await g.commit(noor, changeSet, p('ProposeChangeSet'));
    await g.commit(marcus, changeSet, p('ApproveChangeSet'));
    await g.commit(noor, changeSet, p('ApplyChangeSet'));
    const again = openGateway(path);
    expect(await scenarioStages(again)).toEqual(['draft', 'selected', 'set aside', 'on hold']);
    // And rolled back after the restart, from what the journal recorded.
    await again.commit(noor, changeSet, p('RollBackChangeSet'));
    expect(await scenarioStages(openGateway(path))).toEqual(['draft', 'selected', 'set aside']);
  });
});

describe('drafted in words (platform spec 3.7)', () => {
  it('lets a connected model draft a change set for the Steward, and nothing more', async () => {
    const seen: string[][] = [];
    const g = withSeed([], {
      askModel: {
        model: 'test-model',
        async answer({ toolbox }) {
          seen.push(toolbox.tools.map((t) => t.name));
          const out = await toolbox.run('draft_change_set', {
            summary: 'Study scenarios can wait on a budget decision',
            operations: [{ kind: 'add value', value_set: 'StudyScenarioStatus', value: '', label: 'on hold', replacement: '' }],
          });
          const draft = JSON.parse(out.content) as { identifier: string; operations: string[] };
          expect(draft.operations).toEqual(['Study Scenario status: adds on hold']);
          return { status: 'answered', text: `Drafted ${draft.identifier}.`, cited: [draft.identifier], model: 'test-model-1' };
        },
      },
    });
    const result = await g.ask(noor, 'Add an on hold status to study scenarios');
    expect(seen[0]).toContain('draft_change_set');
    const cited = result.answer!.cited[0];
    expect(g.read(noor, cited.iri).state).toMatchObject({ Status: 'draft' });
    // Nothing in use changed: the status is not there until the draft is proposed, approved and applied.
    expect(await scenarioStages(g)).toEqual(['draft', 'selected', 'set aside']);
    // A person who may not create change sets is never offered the tool.
    await g.ask(marcus, 'Add an on hold status to study scenarios');
    expect(seen[1]).not.toContain('draft_change_set');
  });

  it('withdraws the draft and gives the reasons back when an operation is refused', async () => {
    let reply = '';
    const g = withSeed([], {
      askModel: {
        model: 'test-model',
        async answer({ toolbox }) {
          const out = await toolbox.run('draft_change_set', {
            summary: 'Rename a change set status',
            operations: [{ kind: 'relabel', value_set: '', value: 'ChangeSetStatus-draft', label: 'sketch', replacement: '' }],
          });
          reply = out.content;
          return { status: 'cannot answer', text: 'That cannot be changed here.', cited: [], model: 'test-model-1' };
        },
      },
    });
    await g.ask(noor, 'Call draft change sets sketches');
    expect(reply).toMatch(/^Operation 1 \(relabel\): .*platform/);
    expect(g.find(noor, p('ChangeSet')).map((c) => c.state.Outcome)).toEqual(['withdrawn']);
  });
});
