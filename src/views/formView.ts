import type { ViewNode, ViewSpec } from '../design-system/catalog';
import type { CommitResult, FormField, ObjectForm } from '../data/client';
import type { ComposedInput } from '../gateway/gateway';
import { fieldFor } from './composeView';

/**
 * Creating and editing an object (platform spec 5.3, Creating and editing objects; design system spec 5.1): Fill in, as
 * a medium modal. The required fields first, then the optional ones under Optional, then what will be created or change.
 */

export type FormPreview = { status: 'incomplete' } | { status: 'checking' } | { status: 'ready'; preview: Omit<CommitResult, 'commit'> } | { status: 'refused'; reasons: string[] };

const text = (label: string, component?: 'p' | 'small'): ViewNode => ({ component: 'Content', props: component ? { label, component } : { label } });
const stack = (items: ViewNode[][]): ViewNode => ({ component: 'Stack', props: { hasGutter: true }, children: items.map((children) => ({ component: 'StackItem', children })) });

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
        { component: 'ModalBody', children: [stack(body)] },
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
