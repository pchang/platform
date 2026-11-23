import type { ViewNode, ViewSpec } from '../design-system/catalog';
import type { CommitResult, FormField, ObjectForm } from '../data/client';
import type { ComposedInput } from '../gateway/gateway';
import { fieldFor } from './composeView';
import { dialogBody, group } from './layout';
import { NS } from '../ontology/ontology';

/**
 * Creating and editing an object (platform spec 5.3, Creating and editing objects; design system spec 5.1): Fill in, as
 * a medium modal. The required fields first, then the optional ones under Optional, then what will be created or change.
 */

export type FormPreview = { status: 'incomplete' } | { status: 'checking' } | { status: 'ready'; preview: Omit<CommitResult, 'commit'> } | { status: 'refused'; reasons: string[] };

const text = (label: string, component?: 'p' | 'small'): ViewNode => ({ component: 'Content', props: component ? { label, component } : { label } });

/** A form field as a method input, so it draws the same field: a number, a date, a choice, an object or text. */
const asInput = (f: FormField): ComposedInput => ({
  name: f.name,
  label: f.label,
  kind: f.kind === 'date' ? 'date' : f.kind,
  ...(f.choices ? { choices: f.choices } : {}),
  ...(f.required ? {} : { optional: true }),
});

/** True when every required field has a value. */
export const isFormComplete = (form: ObjectForm, values: Record<string, string>) => form.fields.every((f) => !f.required || values[f.name]?.trim());

/** The form's starting values: an edited object's current ones. */
export const formValues = (form: ObjectForm): Record<string, string> => Object.fromEntries(form.fields.filter((f) => f.value).map((f) => [f.name, f.value!]));

function previewLines(form: ObjectForm, state: FormPreview): ViewNode[] {
  const heading: ViewNode = { component: 'Title', props: { label: form.mode === 'create' ? 'What will be created' : 'What will change', headingLevel: 'h2', size: 'md' } };
  if (state.status === 'incomplete') return [heading, text('Fill in every required field to see it.', 'small')];
  if (state.status === 'checking') return [heading, { component: 'Spinner', props: { size: 'md', 'aria-valuetext': 'Checking' } }];
  if (state.status === 'refused') {
    return [heading, { component: 'Alert', props: { variant: 'danger', title: 'This would be refused', isInline: true, component: 'h3' }, children: state.reasons.map((r) => text(r)) }];
  }
  const created = new Set(state.preview.created);
  const lines = state.preview.changes
    .filter((c) => c.propertyLabel !== 'type' && c.propertyLabel !== 'identifier')
    .map((c) => ({
      // The object's own changes read by property; a change to another object, such as a parent, names it.
      term: created.has(c.subject) || c.subject === form.object?.iri ? c.propertyLabel[0].toUpperCase() + c.propertyLabel.slice(1) : `${c.subjectLabel} ${c.propertyLabel}`,
      value: c.oldLabel && c.newLabel ? `${c.oldLabel} → ${c.newLabel}` : c.newLabel ?? `${c.oldLabel} removed`,
    }));
  return [
    heading,
    {
      component: 'DescriptionList',
      props: { isCompact: true, isHorizontal: true, termWidth: '16ch' },
      children: lines.map((l) => ({
        component: 'DescriptionListGroup',
        children: [
          { component: 'DescriptionListTerm', props: { label: l.term } },
          { component: 'DescriptionListDescription', children: [text(l.value)] },
        ],
      })),
    },
  ];
}

/** The beginning that opens the create form (platform spec 3.3, Starting points). */
export const BEGIN_WITH_FORM = `${NS.p}BeginWithForm`;

/** The field that holds the chosen starting point. It is never one of the form's values. */
export const STARTING_POINT_FIELD = 'startingPoint';

/** The starting point chosen to begin with: the one the person chose, or the only one the platform can run. */
export function chosenStart(form: ObjectForm, values: Record<string, string>) {
  const available = (form.startingPoints ?? []).filter((s) => s.available);
  return available.find((s) => s.startingPoint === values[STARTING_POINT_FIELD]) ?? (available.length === 1 ? available[0] : undefined);
}

/**
 * Starting points (design system spec 5.1; platform spec 3.3): New opens first on the ways a skill names to begin, a card
 * each, those the platform cannot run yet shown with Coming soon and why. Continue opens what the chosen one begins.
 */
export function buildStartingPointView(form: ObjectForm, values: Record<string, string>): ViewSpec {
  const title = `New ${form.typeLabel}`;
  const chosen = chosenStart(form, values);
  const points = form.startingPoints ?? [];
  const cards: ViewNode[] = points.map((p) =>
    p.available
      ? {
          component: 'Card',
          props: { isSelectable: true, value: p.startingPoint, isCompact: true },
          field: STARTING_POINT_FIELD,
          children: [
            { component: 'CardTitle', props: { label: p.label, component: 'h3' } },
            { component: 'CardBody', children: [{ component: 'Content', props: { label: p.description } }] },
          ],
        }
      : {
          component: 'Card',
          props: { isCompact: true },
          children: [
            {
              component: 'CardHeader',
              children: [
                {
                  component: 'Flex',
                  props: { gap: { default: 'gapSm' }, alignItems: { default: 'alignItemsCenter' }, flexWrap: { default: 'wrap' } },
                  children: [{ component: 'CardTitle', props: { label: p.label, component: 'h3' } }, { component: 'Label', props: { label: 'Coming soon', isCompact: true } }],
                },
              ],
            },
            {
              component: 'CardBody',
              children: [group([{ component: 'Content', props: { label: p.description } }, { component: 'Content', props: { label: p.notYet ?? '', component: 'small', isSubtle: true } }])],
            },
          ],
        },
  );
  return {
    pattern: 'choose-a-starting-point',
    because: `${points[0]?.skillLabel ?? 'A skill'} names the ways to begin a new ${form.typeLabel.toLowerCase()} (platform spec 3.3, Starting points)`,
    root: {
      component: 'Modal',
      props: { variant: 'medium', 'aria-label': title },
      children: [
        { component: 'ModalHeader', props: { title, description: form.parent ? `In ${form.parent.identifier} · ${form.parent.title}` : `A new ${form.typeLabel.toLowerCase()}` } },
        { component: 'ModalBody', children: [dialogBody([[{ component: 'Content', props: { label: 'How do you want to start?' } }, group(cards, 'gapMd')]])] },
        {
          component: 'ModalFooter',
          children: [
            { component: 'Button', props: { label: 'Continue', variant: 'primary', isDisabled: !chosen }, intent: 'submit' },
            { component: 'Button', props: { label: 'Cancel', variant: 'link' }, intent: 'cancel' },
          ],
        },
      ],
    },
  };
}

export function buildFormView(form: ObjectForm, state: FormPreview, submitting = false): ViewSpec {
  const title = form.mode === 'create' ? `New ${form.typeLabel}` : `Edit ${form.object!.identifier}`;
  const description = form.mode === 'edit' ? form.object!.title : form.parent ? `In ${form.parent.identifier} · ${form.parent.title}` : `A new ${form.typeLabel.toLowerCase()}`;
  const required = form.fields.filter((f) => f.required);
  const optional = form.fields.filter((f) => !f.required);
  const body: ViewNode[][] = [];
  if (required.length) body.push([{ component: 'Form', children: required.map((f) => fieldFor(asInput(f))) }]);
  if (optional.length) body.push([{ component: 'Title', props: { label: 'Optional', headingLevel: 'h2', size: 'md' } }, { component: 'Form', children: optional.map((f) => fieldFor(asInput(f))) }]);
  body.push(previewLines(form, state));
  return {
    pattern: 'fill-in',
    because: `${form.mode === 'create' ? 'Create' : 'Edit'} is a platform method every type has, drawn from the ${form.typeLabel} type's fields (platform spec 5.3)`,
    root: {
      component: 'Modal',
      props: { variant: 'medium', 'aria-label': title },
      children: [
        { component: 'ModalHeader', props: { title, description } },
        { component: 'ModalBody', children: [dialogBody(body)] },
        {
          component: 'ModalFooter',
          children: [
            { component: 'Button', props: { label: form.mode === 'create' ? 'Create' : 'Save', variant: 'primary', isDisabled: state.status !== 'ready' || submitting }, intent: 'submit' },
            { component: 'Button', props: { label: 'Cancel', variant: 'link' }, intent: 'cancel' },
          ],
        },
      ],
    },
  };
}

/** The outcome, as a notice. */
export function formNotice(form: ObjectForm, result: CommitResult): ViewNode {
  const created = result.created[0];
  const identifier = created ? result.changes.find((c) => c.subject === created)?.subjectLabel ?? created : form.object!.identifier;
  return {
    component: 'Alert',
    props: { variant: 'success', title: form.mode === 'create' ? `Created ${identifier}, a new ${form.typeLabel.toLowerCase()}` : `Saved ${identifier}`, isInline: true, component: 'p' },
  };
}
