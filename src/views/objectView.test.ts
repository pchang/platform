import { describe, expect, it, vi } from 'vitest';
import type { ViewNode } from '../design-system/catalog';
import { validateView } from '../design-system/validateView';
import { withSeed } from '../gateway/node';
import { NS } from '../ontology/ontology';
import { buildObjectView, endKey, journeyStepper, OVERVIEW_TAB } from './objectView';

// Some tests here run a commit on a gateway of their own, which takes longer than the default under a full parallel run.
vi.setConfig({ testTimeout: 30_000 });

// The object panel's content (platform spec 5.1, Within an object; design system spec 4.4), built from real gateway reads.

const ben = { person: `${NS.d}person-ben`, role: `${NS.ls}ClinicalDataManager` };
const chloe = { person: `${NS.d}person-chloe`, role: `${NS.ls}DrugSafetyPhysician` };

function find(node: ViewNode, test: (n: ViewNode) => boolean): ViewNode[] {
  return [...(test(node) ? [node] : []), ...(node.children ?? []).flatMap((c) => find(c, test))];
}
const tabsOf = (root: ViewNode) => find(root, (n) => n.component === 'Tab').map((t) => t.props as { eventKey: string; label: string; count?: number });

describe('the object panel (design system spec 4.4)', () => {
  it('heads a study with its identity and state, then tabs for its overview, patients, formulations and sites, patients first', async () => {
    const gateway = withSeed();
    const study = gateway.read(ben, 'ST-01');
    const view = buildObjectView(study, { methods: await gateway.methods(ben, study.iri) });
    expect(validateView(view).errors).toEqual([]);
    expect(view.pattern).toBe('object');
    const json = JSON.stringify(view);
    // The type's name links to that type's list, then the identifier, quiet (design system spec 4.4, Header).
    expect(json).toContain(`{"component":"Button","props":{"label":"Study","variant":"link","isInline":true,"size":"sm"},"lists":"${study.type}"}`);
    expect(json).toContain('"label":"· ST-01","component":"small","isSubtle":true');
    expect(json).not.toContain('"label":"ST-01 · Study"');
    expect(json).toContain(`"label":"${study.title}","headingLevel":"h2"`);
    expect(tabsOf(view.root).map((t) => [t.label, t.count])).toEqual([
      ['Overview', undefined],
      ['Patients', 12],
      ['Study Scenarios', 1],
      ['Outcome Targets', 0],
      ['Decisions', 0],
      ['Formulations', 1],
      ['Sites', 3],
      ['Study Concepts', 0],
      ['Datasets', 1],
    ]);
    expect(json).toContain('This study enrolls these patients.');
    expect(json).toContain('This study runs at these sites.');
  });

  it('makes every listed object a card that opens it, with the methods the person can run on it', async () => {
    const gateway = withSeed();
    const patient = gateway.read(ben, 'PT-03');
    const visits = patient.links.find((l) => l.pluralLabel === 'Visits')!;
    const related = new Map(await Promise.all(visits.objects.map(async (o) => [o.iri, await gateway.methods(ben, o.iri)] as const)));
    const view = buildObjectView(patient, { related });
    const tab = find(view.root, (n) => n.component === 'Tab' && (n.props as { label: string }).label === 'Visits')[0];
    const cards = find(tab, (n) => n.component === 'Card' && Boolean(n.opens));
    expect(cards.map((c) => c.opens)).toEqual(visits.objects.map((o) => o.iri));
    // Cards in the panel sit under its h2 heading.
    expect(find(cards[0], (n) => n.component === 'CardTitle')[0].props).toMatchObject({ component: 'h3' });
  });

  // A tab's objects are an object list like any other (design system spec 4.4 and 4.3).
  it('lists the objects of a tab with the list bar, as cards or as a list, as the person chose', () => {
    const gateway = withSeed();
    const patient = gateway.read(ben, 'PT-03');
    const tabOf = (view: ReturnType<typeof buildObjectView>) => find(view.root, (n) => n.component === 'Tab' && (n.props as { label: string }).label === 'Visits')[0];
    const cardsTab = tabOf(buildObjectView(patient));
    expect(find(cardsTab, (n) => n.component === 'ToggleGroup')).toHaveLength(1);
    expect(find(cardsTab, (n) => n.component === 'Table')).toHaveLength(0);
    const listTab = tabOf(buildObjectView(patient, { controls: { mode: 'list', selecting: false, selected: new Set() } }));
    expect(find(listTab, (n) => n.component === 'Table')).toHaveLength(1);
    expect(find(listTab, (n) => n.component === 'Card' && Boolean(n.opens))).toHaveLength(0);
    expect(validateView(buildObjectView(patient, { controls: { mode: 'list', selecting: false, selected: new Set() } })).errors).toEqual([]);
  });

  // Ask about this follows the header's methods, as on a card (design system spec 4.1 and 4.4).
  it('follows the methods in the header with Ask about this', async () => {
    const gateway = withSeed();
    const ae = gateway.read(ben, 'AE-003');
    const view = buildObjectView(ae, { methods: await gateway.methods(ben, ae.iri) });
    const header = view.root.children![0];
    const buttons = find(header, (n) => n.component === 'Button' && !n.lists).map((n) => (n.asks ? 'Ask' : (n.props as { label: string }).label));
    expect(buttons.at(-1)).toBe('Ask');
    expect(buttons.length).toBeGreaterThan(1);
    expect(find(header, (n) => n.asks === ae.iri)).toHaveLength(1);
  });

  // The journey under the header (platform spec 5.1, Journey; design system spec 4.4).
  it('shows the journey under the header, each stage said in words as well as drawn', () => {
    const view = buildObjectView(withSeed().read(chloe, 'SC-003'));
    const stepper = find(view.root, (n) => n.component === 'ProgressStepper')[0];
    expect(stepper.props).toMatchObject({ 'aria-label': 'Journey: Workflow, now assessed, stage 3 of 5', horizontalFrom: 'md' });
    expect(stepper.children!.map((c) => c.props)).toEqual([
      { label: 'received', variant: 'success', 'aria-label': 'received, passed' },
      { label: 'triaged', variant: 'success', 'aria-label': 'triaged, passed' },
      { label: 'assessed', variant: 'info', isCurrent: true, description: 'Now', 'aria-label': 'assessed, now' },
      { label: 'reported', variant: 'pending', 'aria-label': 'reported, to come' },
      { label: 'closed', variant: 'pending', 'aria-label': 'closed, to come' },
    ]);
    expect(validateView(view).errors).toEqual([]);
  });

  it('ends a journey at an exit, drawn as a danger and said to be one', () => {
    const stepper = journeyStepper({
      dimension: 'Status',
      steps: [
        { stage: 'detected', status: 'passed' },
        { stage: 'under evaluation', status: 'passed' },
        { stage: 'refuted', status: 'current', exit: true },
      ],
    });
    expect(stepper.props).toMatchObject({ 'aria-label': 'Journey: Status, now refuted, an exit' });
    expect(stepper.children!.at(-1)!.props).toEqual({ label: 'refuted', variant: 'danger', isCurrent: true, description: 'Now', 'aria-label': 'refuted, now, an exit' });
  });

  it('shows no journey for an object whose lifecycle has one stage on its main path', () => {
    expect(find(buildObjectView(withSeed().read(ben, 'AR-1')).root, (n) => n.component === 'ProgressStepper')).toHaveLength(0);
  });

  it('puts the ends that hold one object in the overview as links, named by the type at the other end', () => {
    const view = buildObjectView(withSeed().read(ben, 'PT-03'));
    const overview = find(view.root, (n) => n.component === 'Tab' && (n.props as { eventKey: string }).eventKey === OVERVIEW_TAB)[0];
    const terms = find(overview, (n) => n.component === 'DescriptionListTerm').map((n) => (n.props as { label: string }).label);
    expect(terms).toEqual(expect.arrayContaining(['Study', 'Site', 'Type', 'Domain', 'Last change']));
    const study = find(overview, (n) => n.component === 'Button' && Boolean(n.opens))[0];
    expect(study.opens).toBe(`${NS.d}ST-01`);
    expect((study.props as { label: string }).label).toMatch(/^ST-01 · /);
    // Many-valued ends are tabs, not overview links.
    expect(tabsOf(view.root).map((t) => t.label)).toEqual(['Overview', 'Visits', 'Adverse Events', 'Batches', 'Data Points']);
  });

  it('keeps empty tabs, so every object of a type has the same structure, and says there are none', () => {
    const elena = { person: `${NS.d}person-elena`, role: `${NS.ls}QualityLead` };
    const view = buildObjectView(withSeed().read(elena, 'QE-1'));
    expect(tabsOf(view.root).map((t) => [t.label, t.count])).toEqual([
      ['Overview', undefined],
      ['CAPAs', 0],
    ]);
    expect(JSON.stringify(view)).toContain('No CAPAs yet.');
  });

  it('shows a deadline and urgency in the header, and the last change in the overview', async () => {
    const gateway = withSeed([], { now: () => new Date('2026-11-12T09:00:00Z') });
    await gateway.commit(chloe, 'SC-004', `${NS.ls}Triage`, {
      seriousness: `${NS.lst}SafetyCaseSeriousness-serious`,
      expectedness: `${NS.lst}SafetyCaseExpectedness-unexpected`,
    });
    const json = JSON.stringify(buildObjectView(gateway.read(chloe, 'SC-004'), { today: new Date('2026-11-12T00:00:00Z') }));
    expect(json).toContain('"label":"Urgent","status":"danger"');
    expect(json).toMatch(/Triage by Chloé Martin, /);
    const submission = gateway.read(chloe, 'SUB-1');
    expect(JSON.stringify(buildObjectView(submission, { today: new Date('2026-11-12T00:00:00Z') }))).toContain('"label":"Due Nov 17, 2026","status":"warning"');
  });

  it('names two tabs that reach the same type by their relationships', () => {
    const view = withSeed().read(chloe, 'SC-004');
    const doubled = {
      ...view,
      links: [...view.links, { ...view.links.find((l) => !l.one)!, relationship: `${NS.ls}other`, label: 'is linked to' }],
    };
    const labels = tabsOf(buildObjectView(doubled).root).map((t) => t.label);
    expect(labels.filter((l) => l.includes('('))).toHaveLength(2);
    expect(new Set(tabsOf(buildObjectView(doubled).root).map((t) => t.eventKey)).size).toBe(labels.length);
    expect(endKey(doubled.links.at(-1)!)).toMatch(/^(in|out)-other-[A-Za-z]+$/);
  });
});

describe('an outside agent’s page (design system spec 4.4, Activity)', () => {
  it('ends with its activity: what it committed and proposed, with its reasons, then what it read; and marks what it wrote', async () => {
    const gateway = withSeed();
    const agent = { person: `${NS.d}agent-northbridge`, role: `${NS.ls}ExternalCROAgent`, reason: 'The site confirmed the value' };
    const marcus = { person: `${NS.d}person-marcus`, role: `${NS.ls}ClinicalOperationsLead` };
    await gateway.commit(agent, 'Q-01', `${NS.ls}AnswerQuery`, { answer: 'Confirmed against the lab report' });
    await gateway.commit(agent, 'Q-05', `${NS.ls}CloseQuery`);
    gateway.read(agent, 'Q-01');

    const view = buildObjectView(gateway.read(marcus, 'AG-1'), { methods: await gateway.methods(marcus, 'AG-1') });
    expect(validateView(view).errors).toEqual([]);
    const tabs = tabsOf(view.root);
    expect(tabs.at(-1)).toEqual({ eventKey: 'activity', label: 'Activity', count: 2 });
    const json = JSON.stringify(view);
    for (const phrase of ['Commits and proposals: 2', 'Proposed: Close query', 'Answer query', 'The site confirmed the value', 'Reads: 1']) expect(json).toContain(phrase);

    // A person reading the query sees the answer came from the agent.
    const query = buildObjectView(gateway.read(ben, 'Q-01'), {});
    expect(JSON.stringify(query)).toContain('Written by Northbridge query agent');
    // Nobody else's page has an Activity tab.
    expect(tabsOf(buildObjectView(gateway.read(ben, 'ST-01'), {}).root).map((t) => t.label)).not.toContain('Activity');
  });
});
