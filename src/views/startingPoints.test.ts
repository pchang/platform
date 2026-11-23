// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import { validateView } from '../design-system/validateView';
import { withSeed } from '../gateway/node';
import { NS } from '../ontology/ontology';
import { buildStartingPointView, chosenStart, STARTING_POINT_FIELD } from './formView';

// Starting points (platform spec 3.3; design system spec 5.1): Start a protocol (domain spec 3.9).
vi.setConfig({ testTimeout: 30_000 });

const ls = (n: string) => `${NS.ls}${n}`;
const ben = { person: `${NS.d}person-ben`, role: ls('ClinicalDataManager') };

describe('Start a protocol', () => {
  it('offers three ways to begin a new protocol, and only from scratch runs, with the create form', () => {
    const g = withSeed();
    const form = g.createForm(ben, ls('Protocol'));
    expect(form.startingPoints?.map((s) => [s.label, s.available])).toEqual([
      ['Author from scratch', true],
      ['Start from a template', false],
      ['Import a protocol document', false],
    ]);
    expect(form.startingPoints?.[0].begins).toBe(`${NS.p}BeginWithForm`);
    expect(form.startingPoints?.[2].notYet).toContain('connected model');
    // The form itself is unchanged: from scratch opens it as before.
    expect(form.fields.length).toBeGreaterThan(0);
    // A type no skill names starting points for opens on its form.
    expect(g.createForm(ben, ls('Site')).startingPoints).toBeUndefined();
  });

  it('shows a card each, those not built marked Coming soon, and Continue for the one that runs', () => {
    const form = withSeed().createForm(ben, ls('Protocol'));
    const view = buildStartingPointView(form, {});
    expect(validateView(view).errors).toEqual([]);
    const json = JSON.stringify(view);
    expect(json).toContain('How do you want to start?');
    expect(json.match(/"Coming soon"/g)).toHaveLength(2);
    expect(json.match(/"isSelectable":true/g)).toHaveLength(1);
    // The only one that runs is chosen to begin with, so Continue is ready.
    expect(chosenStart(form, {})?.label).toBe('Author from scratch');
    expect(json).toContain('"label":"Continue","variant":"primary","isDisabled":false');
    expect(chosenStart(form, { [STARTING_POINT_FIELD]: form.startingPoints![1].startingPoint })?.label).toBe('Author from scratch');
  });
});
