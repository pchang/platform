// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import { validateView } from '../design-system/validateView';
import { NS } from '../ontology/ontology';
import { withSeed } from '../gateway/node';
import { buildStartView } from './composeView';
import { fillEmpty, leadingProposal, type ProposalState } from './proposalView';
import { buildSetView } from './setView';

// Each test builds a gateway of its own.
vi.setConfig({ testTimeout: 30_000 });

// Proposals from skills (design system spec 4.3, Proposals from skills; platform spec 3.3, Skills).
const marcus = { person: `${NS.d}person-marcus`, role: `${NS.ls}ClinicalOperationsLead` };
const SIMULATE = `${NS.ls}RunTrialSimulation`;
const COMPARE = `${NS.ls}CompareStudyScenarios`;

const nodesOf = (node: unknown): { component: string; props?: Record<string, unknown> }[] => {
  const n = node as { component: string; props?: Record<string, unknown>; children?: unknown[] };
  return [n, ...(n.children ?? []).flatMap(nodesOf)];
};
const labels = (node: unknown) => nodesOf(node).map((n) => n.props?.label).filter((l): l is string => typeof l === 'string');

describe('the Proposed group', () => {
  it('leads Run trial simulation with the skill, how it ran, its reasoning and each value with its source', async () => {
    const g = withSeed();
    const composition = await g.compose(marcus, 'SSC-1', SIMULATE);
    expect(composition.skills).toEqual([{ skill: `${NS.ls}SimulationAssumptions`, label: 'Simulation assumptions' }]);
    const proposal: ProposalState = { status: 'ready', result: await g.propose(marcus, ['SSC-1'], SIMULATE) };
    const view = buildStartView(composition, { status: 'incomplete' }, undefined, false, false, proposal);
    expect(validateView(view).errors).toEqual([]);
    const text = labels(view.root);
    const at = (l: string) => text.indexOf(l);
    expect(at('Proposed by Simulation assumptions')).toBeGreaterThan(-1);
    // Every value rests on TS-1, so it is named once.
    expect(text).toContain('Version 1.0 · reference procedure · from TS-1');
    expect(text.filter((l) => l === 'from TS-1')).toEqual([]);
    // It leads the body: before the fields it pre-fills.
    expect(at('Proposed by Simulation assumptions')).toBeLessThan(at('Screen failure rate, percent'));
  });

  it('shows a spinner while it is worked out, and nothing when no skill serves the method', async () => {
    const g = withSeed();
    const composition = await g.compose(marcus, 'SSC-1', SIMULATE);
    expect(labels(buildStartView(composition, { status: 'incomplete' }, undefined, false, false, { status: 'working' }).root)).toContain('Working out a proposal…');
    expect(labels(buildStartView(composition, { status: 'incomplete' }).root).some((l) => l.startsWith('Proposed by'))).toBe(false);
  });

  it('fills only the fields left empty', () => {
    const proposal = { values: [{ name: 'dropoutRate', value: '15' }, { name: 'saeRate', value: '6' }] } as Parameters<typeof fillEmpty>[1];
    expect(fillEmpty({ dropoutRate: '20', saeRate: '' }, proposal)).toEqual({ dropoutRate: '20', saeRate: '6' });
  });
});

describe('the recommendation in Compare and decide', () => {
  it('outlines and labels the recommended card, puts the reasoning between Side by side and Decide, and pre-selects only the choice', async () => {
    const g = withSeed();
    const ids = ['SSC-1', 'SSC-2', 'SSC-3'];
    const composition = await g.composeSet(marcus, ids, COMPARE);
    const proposal: ProposalState = { status: 'ready', result: await g.propose(marcus, ids, COMPARE) };
    const values = fillEmpty({}, leadingProposal(proposal));
    expect(values).toEqual({ chosen: `${NS.d}SSC-3` });
    const view = buildSetView(composition, { status: 'incomplete' }, false, values, proposal);
    expect(validateView(view).errors).toEqual([]);
    const cards = nodesOf(view.root).filter((n) => n.component === 'Card');
    expect(cards.map((c) => Boolean(c.props?.isHighlighted))).toEqual([false, false, true]);
    expect(labels(cards[2])).toContain('Recommended');
    expect(labels(cards[0])).not.toContain('Recommended');
    const text = labels(view.root);
    expect(text.indexOf('Side by side')).toBeLessThan(text.indexOf('Recommendation'));
    expect(text.indexOf('Recommendation')).toBeLessThan(text.indexOf('Decide'));
    expect(text).toContain('Recommend a study scenario · Version 1.0 · reference procedure');
    // The button names the decision with the pre-selected scenario.
    expect(text).toContain('Select SSC-3');
  });

  it('labels no card on a tie, and still says why', async () => {
    const g = withSeed();
    const ids = ['SSC-1', 'SSC-2'];
    const composition = await g.composeSet(marcus, ids, COMPARE);
    const proposal: ProposalState = { status: 'ready', result: await g.propose(marcus, ids, COMPARE) };
    expect(fillEmpty({}, leadingProposal(proposal))).toEqual({});
    const view = buildSetView(composition, { status: 'incomplete' }, false, {}, proposal);
    expect(labels(view.root)).not.toContain('Recommended');
    expect(labels(view.root).some((l) => l.startsWith('No recommendation: SSC-1 and SSC-2 tie.'))).toBe(true);
  });
});

describe('Choose an object (design system spec 5.1)', () => {
  it('gives an object input with many choices a search field that narrows them, keeping the one chosen', async () => {
    const { buildComposeView } = await import('./composeView');
    const g = withSeed();
    const noor = { person: `${NS.d}person-noor`, role: `${NS.p}StructureSteward` };
    const { created } = await g.create(noor, `${NS.p}ChangeSet`, { changeSummary: 'Add on hold' });
    const composition = await g.compose(noor, created[0], `${NS.p}AddValue`);
    expect(composition.archetype.label).toBe('Choose an object');
    const all = buildComposeView(composition, { status: 'incomplete' });
    expect(validateView(all).errors).toEqual([]);
    expect(all.pattern).toBe('choose-an-object');
    const options = (view: ReturnType<typeof buildComposeView>) => nodesOf(view.root).filter((n) => n.component === 'FormSelectOption').length;
    const narrowed = buildComposeView(composition, { status: 'incomplete' }, false, false, { status: 'none' }, { valueSetSearch: 'study scenario status' });
    expect(validateView(narrowed).errors).toEqual([]);
    expect(options(narrowed)).toBe(2);
    expect(options(all)).toBeGreaterThan(50);
    // The one chosen stays, whatever is typed.
    const chosen = composition.inputs[0].choices![0].value;
    expect(options(buildComposeView(composition, { status: 'incomplete' }, false, false, { status: 'none' }, { valueSetSearch: 'zzz', valueSet: chosen }))).toBe(2);
  });
});
