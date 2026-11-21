import type { ViewNode, ViewSpec } from '../design-system/catalog';
import type { CommitResult, MethodComposition } from '../data/client';
import { changeLines, fieldFor } from './composeView';
import { countOf } from './batchView';
import { dialogBody } from './layout';

/**
 * A set method (platform spec 5.4, Acting on a set; design system spec 5.1, Compare and decide over a set): the set's
 * objects side by side as cards, the comparison's rows first, then the decision and its preview, as one modal.
 */

export type SetPreview = { status: 'incomplete' } | { status: 'checking' } | { status: 'ready'; preview: Omit<CommitResult, 'commit'> } | { status: 'refused'; reasons: string[] };

const text = (label: string, component?: 'p' | 'small'): ViewNode => ({ component: 'Content', props: component ? { label, component } : { label } });

/** A cell's value without its row's name, when its title repeats it: "Last patient in: 19.6 months" reads "19.6 months". */
function valueOf(title: string, row: string): string {
  return title.toLowerCase().startsWith(`${row.toLowerCase()}: `) ? title.slice(row.length + 2) : title;
}

/** One card per object of the set: its title, then each comparison row, marked where the objects differ or it is urgent. */
function setCards(composition: MethodComposition): ViewNode {
  const objects = composition.objects ?? [];
  const rows = composition.comparison?.rows ?? [];
  const span = objects.length >= 3 ? 4 : 6;
  return {
    component: 'Grid',
    props: { hasGutter: true },
    children: objects.map((object, column) => ({
      component: 'GridItem',
      props: { span: 12, md: span },
      children: [
        {
          component: 'Card',
          props: { isFullHeight: true },
          children: [
            { component: 'CardHeader', children: [text(`${object.identifier} · ${object.typeLabel}`, 'small'), { component: 'CardTitle', props: { label: object.title, component: 'h3' } }] },
            {
              component: 'CardBody',
              children: [
                rows.length
                  ? {
                      component: 'DescriptionList',
                      props: { isCompact: true },
                      children: rows.map((row) => {
                        const cell = row.cells[column];
                        const values = new Set(row.cells.map((c) => (c ? valueOf(c.title, row.label) : '—')));
                        return {
                          component: 'DescriptionListGroup',
                          children: [
                            { component: 'DescriptionListTerm', props: { label: row.label } },
                            {
                              component: 'DescriptionListDescription',
                              children: [
                                {
                                  component: 'Flex',
                                  props: { gap: { default: 'gapSm' }, flexWrap: { default: 'wrap' } },
                                  children: cell
                                    ? [
                                        text(valueOf(cell.title, row.label)),
                                        ...(cell.status ? [{ component: 'Label', props: { label: cell.status, isCompact: true, ...(cell.urgent ? { status: 'warning' } : {}) } }] : []),
                                        ...(values.size > 1 && !cell.status ? [{ component: 'Label', props: { label: 'Different', color: 'orange', isCompact: true } }] : []),
                                      ]
                                    : [text('Not simulated', 'small')],
                                },
                              ],
                            },
                          ],
                        };
                      }),
                    }
                  : text('Nothing to compare yet.', 'small'),
              ],
            },
          ],
        },
      ],
    })),
  };
}

function preview(composition: MethodComposition, state: SetPreview): ViewNode[] {
  const heading: ViewNode = { component: 'Title', props: { label: 'What will change', headingLevel: 'h2', size: 'md' } };
  if (state.status === 'incomplete') return [heading, text('Choose the one to select and give a rationale to see what will change.', 'small')];
  if (state.status === 'checking') return [heading, { component: 'Spinner', props: { size: 'md', 'aria-valuetext': 'Checking what will change' } }];
  if (state.status === 'refused') {
    return [heading, { component: 'Alert', props: { variant: 'danger', title: 'This would be refused', isInline: true, component: 'h3' }, children: state.reasons.map((r) => text(r)) }];
  }
  // Each object's own changes, by identifier, then what is created.
  return [
    heading,
    {
      component: 'DescriptionList',
      props: { isCompact: true, isHorizontal: true, termWidth: '16ch' },
      // In a set no object is the method's own, so every change names its object.
      children: changeLines({ ...composition, object: { ...composition.object, iri: '' } }, state.preview).map((l) => ({
        component: 'DescriptionListGroup',
        children: [
          { component: 'DescriptionListTerm', props: { label: l.term } },
          { component: 'DescriptionListDescription', children: [text(l.value)] },
        ],
      })),
    },
  ];
}

export function buildSetView(composition: MethodComposition, state: SetPreview, submitting = false): ViewSpec {
  const objects = composition.objects ?? [];
  const title = `${composition.label}: ${countOf(objects)}`;
  const body: ViewNode[][] = [
    [{ component: 'Title', props: { label: 'Side by side', headingLevel: 'h2', size: 'md' } }, text('Each scenario’s current forecasts, against their targets.', 'small'), setCards(composition)],
    [{ component: 'Title', props: { label: 'Decide', headingLevel: 'h2', size: 'md' } }, { component: 'Form', children: composition.inputs.map(fieldFor) }],
    preview(composition, state),
  ];
  return {
    pattern: 'compare-and-decide',
    because: `${composition.label} is a Compare and decide method on a set of ${objects.length} (platform spec 5.4, Acting on a set)`,
    root: {
      component: 'Modal',
      props: { variant: 'large', 'aria-label': title },
      children: [
        { component: 'ModalHeader', props: { title, description: objects.map((o) => o.identifier).join(', ') } },
        { component: 'ModalBody', children: [dialogBody(body)] },
        {
          component: 'ModalFooter',
          children: [
            { component: 'Button', props: { label: composition.label, variant: 'primary', isDisabled: state.status !== 'ready' || submitting }, intent: 'submit' },
            { component: 'Button', props: { label: 'Cancel', variant: 'link' }, intent: 'cancel' },
          ],
        },
      ],
    },
  };
}

/** The outcome, as a notice: which was chosen, and which were set aside. */
export function setNotice(composition: MethodComposition, chosen: string, result: CommitResult): ViewNode {
  const objects = composition.objects ?? [];
  const chosenObject = objects.find((o) => o.iri === chosen);
  return {
    component: 'Alert',
    props: { variant: 'success', title: `${composition.label}: ${chosenObject?.identifier ?? 'one'} chosen of ${countOf(objects)}`, isInline: true, component: 'p' },
    children: result.changes
      .filter((c) => c.subject !== result.created[0])
      .map((c) => text(`${c.subjectLabel}: ${c.propertyLabel.toLowerCase()} ${c.newLabel ?? c.newValue ?? 'removed'}.`)),
  };
}
