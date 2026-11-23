// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { validateView } from '../design-system/validateView';
import { NS } from '../ontology/ontology';
import { withSeed } from '../gateway/node';
import { buildSetView, commitLabelOf } from './setView';

// A set method's commit button (platform spec 5.4; design system spec 4.3, Set actions): it names the decision.
const marcus = { person: `${NS.d}person-marcus`, role: `${NS.ls}ClinicalOperationsLead` };
const COMPARE = `${NS.ls}CompareStudyScenarios`;

const footerLabels = (view: ReturnType<typeof buildSetView>) => {
  const footer = (view.root.children ?? []).find((c) => c.component === 'ModalFooter')!;
  return (footer.children ?? []).map((b) => (b.props as { label: string; isDisabled?: boolean }).label);
};

describe('Compare study scenarios', () => {
  it('names its commit button for the decision: Select, then Select SSC-3 once one is chosen, never the comparison', async () => {
    const g = withSeed();
    const composition = await g.composeSet(marcus, ['SSC-1', 'SSC-2', 'SSC-3'], COMPARE);
    const choice = composition.inputs.find((i) => i.kind === 'object')!.name;
    expect(commitLabelOf(composition)).toBe('Select');
    expect(commitLabelOf(composition, { [choice]: composition.objects![2].iri })).toBe('Select SSC-3');
    const before = buildSetView(composition, { status: 'incomplete' }, false, {});
    expect(validateView(before).errors).toEqual([]);
    expect(footerLabels(before)).toEqual(['Select', 'Cancel']);
    const after = buildSetView(composition, { status: 'incomplete' }, false, { [choice]: composition.objects![0].iri });
    expect(footerLabels(after)).toEqual(['Select SSC-1', 'Cancel']);
    // The dialog itself is still the comparison.
    expect(JSON.stringify(after)).toContain('Compare study scenarios: 3 study scenarios');
  });

  it('keeps a method’s own name on its button when it names no commit word', async () => {
    const g = withSeed();
    const composition = await g.composeSet(marcus, ['SSC-1', 'SSC-2', 'SSC-3'], COMPARE);
    const { commitLabel: _dropped, ...unnamed } = composition;
    void _dropped;
    expect(commitLabelOf(unnamed)).toBe('Compare study scenarios');
  });
});
