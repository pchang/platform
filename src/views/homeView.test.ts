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
    // Circles in the legend, so a marker is never mistaken for a segment of the bar.
    expect(json).toContain('"symbol":{"fill":"var(--pf-t--chart--color--blue--100)","type":"circle"}');
    expect(json).not.toContain('"type":"square"');
  });

  it('links each metric that counts anything to its objects, and opens them on a valid page of their own', async () => {
    const g = withSeed([], { now });
    const ben = as('person-ben', 'ClinicalDataManager');
    const json = JSON.stringify(buildTodoView(await g.todo(ben), { name: 'Ben Okafor', role: 'Clinical Data Manager' }, undefined, [], { home: g.home(ben), today: now() }));
    // The whole tile shows its objects; there is no View link.
    expect(json).toContain('"component":"Card","props":{"isFullHeight":true,"isCompact":true},"shows":"https://w3id.org/lsh-platform/life-sciences#Metric-OpenDataQueries"');
    expect(json).not.toContain('"label":"View 3"');
    // A metric that counts nothing has nothing to open.
    const marcus = as('person-marcus', 'ClinicalOperationsLead');
    const home = g.home(marcus);
    const none = { ...home, metrics: home.metrics.map((m) => (m.label === 'Budgets over their ceiling' ? { ...m, count: 0 } : m)) };
    const marcusView = JSON.stringify(buildTodoView([], { name: 'Marcus Bell', role: 'Clinical Operations Lead' }, undefined, [], { home: none, today: now() }));
    expect(marcusView).not.toContain('Metric-BudgetsOverCeiling"');
    expect(marcusView).toContain('Metric-ForecastsMissingTarget"');
    const { metric, objects } = g.metricObjects(ben, 'Metric-OpenDataQueries');
    const page = metricPage(metric, objectList(objectEntries(objects), NO_CONTROLS, metric.label));
    expect(validateView(page).errors).toEqual([]);
    expect(JSON.stringify(page)).toContain('"label":"3 of 8 data queries."');
    // The way back is the first thing on the page, above the heading, and goes to Home.
    expect(JSON.stringify(page)).toContain('"label":"Back to Home","variant":"link","icon":"arrow-left","isInline":true},"goes":"home"');
    expect(JSON.stringify(page).indexOf('Back to Home')).toBeLessThan(JSON.stringify(page).indexOf('"label":"Open data queries"'));
  });

  it('links each Where things stand row’s name to that type’s list of objects', async () => {
    const g = withSeed([], { now });
    const ben = as('person-ben', 'ClinicalDataManager');
    const home = g.home(ben);
    const view = buildTodoView(await g.todo(ben), { name: 'Ben Okafor', role: 'Clinical Data Manager' }, undefined, [], { home, today: now() });
    expect(validateView(view).errors).toEqual([]);
    const json = JSON.stringify(view);
    for (const l of home.lifecycles) expect(json, l.pluralLabel).toContain(`{"component":"Title","props":{"label":"${l.pluralLabel}","headingLevel":"h3","size":"md"},"lists":"${l.type}"}`);
    // Only a heading or a button may list a type.
    expect(validateView({ pattern: 'card-view', because: 'x', root: { component: 'Card', lists: 'ls:Visit' } }).errors.join(' ')).toContain('only a Button or a Title lists a type');
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
