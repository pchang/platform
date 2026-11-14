import { describe, expect, it } from 'vitest';
import type { ViewNode } from '../design-system/catalog';
import { validateView } from '../design-system/validateView';
import { withSeed } from '../gateway/node';
import { NS } from '../ontology/ontology';
import { buildObjectView, endKey, OVERVIEW_TAB } from './objectView';

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
    expect(json).toContain('"label":"ST-01 · Study"');
    expect(json).toContain(`"label":"${study.title}","headingLevel":"h2"`);
    expect(tabsOf(view.root).map((t) => [t.label, t.count])).toEqual([
      ['Overview', undefined],
      ['Patients', 12],
      ['Formulations', 1],
      ['Sites', 3],
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

  it('puts the ends that hold one object in the overview as links, named by the type at the other end', () => {
    const view = buildObjectView(withSeed().read(ben, 'PT-03'));
    const overview = find(view.root, (n) => n.component === 'Tab' && (n.props as { eventKey: string }).eventKey === OVERVIEW_TAB)[0];
    const terms = find(overview, (n) => n.component === 'DescriptionListTerm').map((n) => (n.props as { label: string }).label);
    expect(terms).toEqual(expect.arrayContaining(['Study', 'Site', 'Type', 'Domain', 'Last change']));
    const study = find(overview, (n) => n.component === 'Button' && Boolean(n.opens))[0];
    expect(study.opens).toBe(`${NS.d}ST-01`);
    expect((study.props as { label: string }).label).toMatch(/^ST-01 · /);
    // Many-valued ends are tabs, not overview links.
    expect(tabsOf(view.root).map((t) => t.label)).toEqual(['Overview', 'Visits', 'Adverse Events', 'Batches']);
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
