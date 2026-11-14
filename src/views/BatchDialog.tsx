import { useEffect, useMemo, useState } from 'react';
import type { ViewNode } from '../design-system/catalog';
import { RefusedError, type MethodComposition, type ObjectSummary } from '../data/client';
import { usePrincipal } from '../principal/PrincipalProvider';
import { ViewRenderer } from '../renderer/Renderer';
import { batchNotice, buildBatchView, readyCount, type BatchPreview } from './batchView';
import { buildRefusedView } from './composeView';

const reasonsOf = (e: unknown) => (e instanceof RefusedError ? e.reasons : [String(e)]);

/**
 * Runs one method on several objects (platform spec 5.4, Acting on many objects; design system spec 4.3): the inputs once,
 * a preview for each object, then one commit each for those that would succeed. Reports the outcome as a notice.
 */
export function BatchDialog({
  objects,
  method,
  onDone,
  onCancel,
}: {
  objects: ObjectSummary[];
  method: string;
  onDone: (notice: ViewNode) => void;
  onCancel: () => void;
}) {
  const { client, principal } = usePrincipal();
  const [composition, setComposition] = useState<MethodComposition>();
  const [values, setValues] = useState<Record<string, string>>({});
  const [state, setState] = useState<BatchPreview>({ status: 'incomplete' });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string[]>();

  // The inputs and their choices come from the first object; every object is checked on its own below.
  useEffect(() => {
    let cancelled = false;
    client.compose(principal, objects[0].iri, method).then(
      (c) => {
        if (cancelled) return;
        setComposition(c);
        setValues(Object.fromEntries(c.inputs.filter((i) => i.default).map((i) => [i.name, i.default!])));
      },
      (e: unknown) => !cancelled && setError(reasonsOf(e)),
    );
    return () => {
      cancelled = true;
    };
  }, [client, principal, objects, method]);

  const inputsKey = JSON.stringify(values);
  const complete = useMemo(() => Boolean(composition?.inputs.every((i) => values[i.name]?.trim())), [composition, values]);
  useEffect(() => {
    if (!composition) return;
    if (!complete) {
      setState({ status: 'incomplete' });
      return;
    }
    let cancelled = false;
    setState({ status: 'checking' });
    const timer = setTimeout(() => {
      const inputs = JSON.parse(inputsKey) as Record<string, string>;
      Promise.all(
        objects.map((object) =>
          client.preview(principal, object.iri, method, inputs).then(
            (preview) => ({ object, preview }),
            (e: unknown) => ({ object, reasons: reasonsOf(e) }),
          ),
        ),
      ).then((previews) => !cancelled && setState({ status: 'ready', previews }));
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [client, principal, objects, method, composition, complete, inputsKey]);

  if (error) return <ViewRenderer view={buildRefusedView(error)} host={{ onIntent: onCancel }} />;
  if (!composition) return null;

  return (
    <ViewRenderer
      view={buildBatchView(composition, objects, state, submitting)}
      host={{
        values,
        onField: (field, value) => setValues((v) => ({ ...v, [field]: value })),
        onIntent: async (intent) => {
          if (intent === 'cancel') return onCancel();
          if (intent !== 'submit' || state.status !== 'ready' || submitting || readyCount(state) === 0) return;
          setSubmitting(true);
          // One commit per object, one at a time: each is checked again and recorded on its own (platform spec 5.4).
          const done: ObjectSummary[] = [];
          const leftOut = state.previews.filter((p) => p.reasons).map((p) => ({ object: p.object, reasons: p.reasons! }));
          for (const { object } of state.previews.filter((p) => p.preview)) {
            try {
              await client.commit(principal, object.iri, method, values);
              done.push(object);
            } catch (e) {
              leftOut.push({ object, reasons: reasonsOf(e) });
            }
          }
          onDone(batchNotice(composition, done, leftOut));
        },
      }}
    />
  );
}
