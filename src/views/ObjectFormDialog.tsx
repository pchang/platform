import { useEffect, useState } from 'react';
import type { ViewNode } from '../design-system/catalog';
import { RefusedError, type ObjectForm } from '../data/client';
import { usePrincipal } from '../principal/PrincipalProvider';
import { ViewRenderer } from '../renderer/Renderer';
import { buildRefusedView } from './composeView';
import { BEGIN_WITH_FORM, buildFormView, buildStartingPointView, chosenStart, STARTING_POINT_FIELD, formNotice, formValues, isFormComplete, type FormPreview } from './formView';

const reasonsOf = (e: unknown) => (e instanceof RefusedError ? e.reasons : [String(e)]);

/** What the form is for: a new object of a type, inside an object when given, or an existing object. */
export type FormTarget = { mode: 'create'; type: string; within?: string } | { mode: 'edit'; object: string };

/**
 * Creates or edits an object (platform spec 5.3, Creating and editing objects): the form from the gateway, a preview once
 * every required field is given, then one commit. Reports the outcome as a notice.
 */
export function ObjectFormDialog({ target, onDone, onCancel }: { target: FormTarget; onDone: (notice: ViewNode) => void; onCancel: () => void }) {
  const { client, principal } = usePrincipal();
  const [form, setForm] = useState<ObjectForm>();
  const [values, setValues] = useState<Record<string, string>>({});
  const [state, setState] = useState<FormPreview>({ status: 'incomplete' });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string[]>();
  // How to begin, when a skill names the ways (platform spec 3.3, Starting points).
  const [start, setStart] = useState<Record<string, string>>({});
  const [begun, setBegun] = useState(false);
  const key = JSON.stringify(target);

  useEffect(() => {
    let cancelled = false;
    const t = JSON.parse(key) as FormTarget;
    (t.mode === 'create' ? client.createForm(principal, t.type, t.within) : client.editForm(principal, t.object)).then(
      (f) => {
        if (cancelled) return;
        setForm(f);
        setValues(formValues(f));
      },
      (e: unknown) => !cancelled && setError(reasonsOf(e)),
    );
    return () => {
      cancelled = true;
    };
  }, [client, principal, key]);

  const valuesKey = JSON.stringify(values);
  const complete = form ? isFormComplete(form, values) : false;
  useEffect(() => {
    if (!form) return;
    if (!complete) {
      setState({ status: 'incomplete' });
      return;
    }
    let cancelled = false;
    setState({ status: 'checking' });
    const given = JSON.parse(valuesKey) as Record<string, string>;
    const timer = setTimeout(() => {
      (form.mode === 'create' ? client.previewCreate(principal, form.type, given, form.parent?.iri) : client.previewEdit(principal, form.object!.iri, given)).then(
        (preview) => !cancelled && setState({ status: 'ready', preview }),
        (e: unknown) => !cancelled && setState({ status: 'refused', reasons: reasonsOf(e) }),
      );
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [client, principal, form, complete, valuesKey]);

  if (error) return <ViewRenderer view={buildRefusedView(error)} host={{ onIntent: onCancel }} />;
  if (!form) return null;

  // Starting points (platform spec 3.3): first how to begin, then what the chosen one begins, here the create form.
  if (form.startingPoints?.length && !begun) {
    return (
      <ViewRenderer
        view={buildStartingPointView(form, start)}
        host={{
          // The only starting point that runs shows as chosen to begin with.
          values: { [STARTING_POINT_FIELD]: chosenStart(form, start)?.startingPoint ?? '', ...start },
          onField: (field, value) => setStart((v) => ({ ...v, [field]: value })),
          onIntent: (intent) => {
            if (intent === 'cancel') return onCancel();
            if (intent === 'submit' && chosenStart(form, start)?.begins === BEGIN_WITH_FORM) setBegun(true);
          },
        }}
      />
    );
  }

  return (
    <ViewRenderer
      view={buildFormView(form, state, submitting)}
      host={{
        values,
        onField: (field, value) => setValues((v) => ({ ...v, [field]: value })),
        onIntent: async (intent) => {
          if (intent === 'cancel') return onCancel();
          if (intent !== 'submit' || state.status !== 'ready' || submitting) return;
          setSubmitting(true);
          try {
            const result = form.mode === 'create' ? await client.create(principal, form.type, values, form.parent?.iri) : await client.edit(principal, form.object!.iri, values);
            onDone(formNotice(form, result));
          } catch (e) {
            setSubmitting(false);
            setState({ status: 'refused', reasons: reasonsOf(e) });
          }
        },
      }}
    />
  );
}
