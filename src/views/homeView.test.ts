// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { validateView } from '../design-system/validateView';
import { NS } from '../ontology/ontology';
import { withSeed } from '../gateway/node';
import { buildTodoView, NO_CONTROLS, objectEntries, objectList } from './orientView';
import { keepingUp, metricPage, rampStep } from './homeView';

// Home (platform spec 5.1; design system spec 4.3, Home), drawn from the gateway's answer for real roles.
const as = (person: string, role: string) => ({ person: `${NS.d}${person}`, role: `${NS.ls}${role}` });
const now = () => new Date('2026-11-12T12:00:00Z');

describe('Home view', () => {
  it.each([
    ['Clinical Data Manager', as('person-ben', 'ClinicalDataManager')],
    ['Clinical Operations Lead', as('person-marcus', 'ClinicalOperationsLead')],
    ['Portfolio Strategist', as('person-ingrid', 'PortfolioStrategist')],
  ])('is a valid view for the %s, in order: Your world, Where things stand, Your work', async (role, who) => {
    const g = withSeed([], { now });
    const view = buildTodoView(await g.todo(who), { name: 'Someone', role }, undefined, [], { home: g.home(who), today: now() });
    expect(validateView(view).errors).toEqual([]);
    const json = JSON.stringify(view);
    const order = ['Your world', 'Where things stand', 'Your work'].map((h) => json.indexOf(`"label":"${h}"`));
    expect(order.every((i) => i > 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
  });

  it('marks health with a word and its status, never color alone', async () => {
    const g = withSeed([], { now });
    const ben = as('person-ben', 'ClinicalDataManager');
    const json = JSON.stringify(buildTodoView(await g.todo(ben), { name: 'Ben Okafor', role: 'Clinical Data Manager' }, undefined, [], { home: g.home(ben), today: now() }));
    expect(json).toContain('"label":"Watch","status":"warning"');
    // Each bar's figures are in its legend and its description, so it is never read by color alone.
    expect(json).toContain('"ariaDesc":"8 data queries: open 3, answered 3, closed 2"');
    expect(json).toContain('"name":"open 3"');
  });

  it('links each metric that counts anything to its objects, and opens them on a valid page of their own', async () => {
    const g = withSeed([], { now });
    const ben = as('person-ben', 'ClinicalDataManager');
    const json = JSON.stringify(buildTodoView(await g.todo(ben), { name: 'Ben Okafor', role: 'Clinical Data Manager' }, undefined, [], { home: g.home(ben), today: now() }));
    expect(json).toContain('"label":"View 3","aria-label":"View 3: open data queries","variant":"link","isInline":true},"shows":"https://w3id.org/lsh-platform/life-sciences#Metric-OpenDataQueries"');
    // A metric that counts nothing has nothing to open.
    const marcus = as('person-marcus', 'ClinicalOperationsLead');
    expect(JSON.stringify(buildTodoView([], { name: 'Marcus Bell', role: 'Clinical Operations Lead' }, undefined, [], { home: g.home(marcus), today: now() }))).not.toContain('Metric-BudgetsOverCeiling"');
    const { metric, objects } = g.metricObjects(ben, 'Metric-OpenDataQueries');
    const page = metricPage(metric, objectList(objectEntries(objects), NO_CONTROLS, metric.label));
    expect(validateView(page).errors).toEqual([]);
    expect(JSON.stringify(page)).toContain('"label":"3 of 8 data queries."');
  });

  it('runs the blue ramp from the first stage to the last', () => {
    expect([0, 1, 2, 3, 4].map((i) => rampStep(i, 5))).toEqual([100, 200, 300, 400, 500]);
    expect([0, 1, 2].map((i) => rampStep(i, 3))).toEqual([100, 300, 500]);
    expect([0, 1].map((i) => rampStep(i, 2))).toEqual([100, 500]);
  });

  it('says how the person is keeping up', () => {
    expect(keepingUp({ metrics: [], lifecycles: [], doneLast7Days: 4 }, 1)).toBe('You’ve done 4 things in the last 7 days; 1 item is overdue.');
    expect(keepingUp({ metrics: [], lifecycles: [], doneLast7Days: 0 }, 0)).toBe('You haven’t done anything here in the last 7 days; nothing is overdue.');
  });
});
