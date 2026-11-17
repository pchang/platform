import { describe, expect, it } from 'vitest';
import type { ViewNode } from '../design-system/catalog';
import { validateView } from '../design-system/validateView';
import { withSeed } from '../gateway/node';
import { NS } from '../ontology/ontology';
import { buildGlanceListView, buildGlanceView, measured } from './glanceView';

// At a glance (platform spec 5.1; design system spec 4.5).
const morgan = { person: `${NS.d}person-morgan`, role: `${NS.ls}ClinicalProgramLead` };
const ada = { person: `${NS.d}person-ada`, role: `${NS.ls}ComputationalChemist` };
const now = () => new Date('2026-11-15T09:00:00Z');
const today = now();
const find = (node: ViewNode, match: (n: ViewNode) => boolean): ViewNode[] => [...(match(node) ? [node] : []), ...(node.children ?? []).flatMap((c) => find(c, match))];
const labels = (node: ViewNode) => find(node, (n) => n.component === 'Content' || n.component === 'Title' || n.component === 'CardTitle').map((n) => (n.props as { label: string }).label);

describe('At a glance view', () => {
  const glance = withSeed([], { now }).glance(morgan, 'ST-01');
  const view = buildGlanceView(glance, { today });

  it('is drawn only from the catalog, in the glance pattern', () => {
    expect(view.pattern).toBe('glance');
    expect(validateView(view).errors).toEqual([]);
    expect(validateView(buildGlanceListView(withSeed([], { now }).glanceList(morgan))).errors).toEqual([]);
  });

  it('heads with the initiative, its health in words and its journey', () => {
    expect(labels(view.root)).toEqual(expect.arrayContaining(['ST-01 · Study', 'Off track: 3 of 6 health rules need attention.']));
    expect(find(view.root, (n) => n.component === 'ProgressStepper')).toHaveLength(1);
  });

  it('says each rule’s measure in words, with the level it crossed or stays within', () => {
    const rule = (label: string) => glance.rules.find((r) => r.label === label)!;
    expect(measured(rule('Overdue visits'))).toBe('5 visits overdue, above 3');
    expect(measured(rule('Data awaiting verification'))).toBe('14 of 40 data records entered (35%), above 25%');
    expect(measured(rule('Serious events not yet with safety'))).toBe('2 adverse events urgent, above 0');
    expect(measured(rule('Missed visits'))).toBe('0 of 30 visits missed (0%), at or below 5%');
  });

  it('gives each type in the scope a progress card, titled with its count', () => {
    expect(labels(view.root)).toEqual(expect.arrayContaining(['Patients · 12', 'Visits · 30', 'Safety Cases · 2', 'Progress']));
    expect(find(view.root, (n) => n.component === 'Progress').length).toBeGreaterThan(5);
  });

  it('lists what needs attention as an object list, each with its deadline or urgency', () => {
    expect(labels(view.root)).toContain(`Needs attention · ${glance.attention.length}`);
    const json = JSON.stringify(view.root);
    expect(json).toContain('"label":"Overdue since Nov 3, 2026","status":"danger"');
    expect(json).toContain('"opens":"https://example.org/lsh-data/AE-003"');
  });

  it('says when a rule is about what the person may not read, rather than judging it', () => {
    const hidden = buildGlanceView(withSeed([], { now }).glance(ada, 'ST-01'), { today });
    expect(labels(hidden.root)).toContain('Missed visits: not shown to your role, which may not read visits.');
  });
});
