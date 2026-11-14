import { useEffect, useMemo, useState } from 'react';
import type { ViewNode } from '../design-system/catalog';
import { RefusedError, type MethodComposition, type ObjectSummary } from '../data/client';
import { usePrincipal } from '../principal/PrincipalProvider';
import { ViewRenderer } from '../renderer/Renderer';
import { batchModeOf, batchNotice, buildBatchView, buildSequentialBatchView, inputsFor, isComplete, readyCount, type BatchPreview, type ObjectPreview } from './batchView';
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
  const sequential = composition ? batchModeOf(composition) === 'one after another' : false;
  const complete = useMemo(() => Boolean(composition?.inputs.every((i) => values[i.name]?.trim())), [composition, values]);

  // One after another: each object is previewed with its own inputs once they are all given (platform spec 5.4).
  const [states, setStates] = useState<Map<string, ObjectPreview>>(new Map());
  const objectKeys = useMemo(
    () => (composition && sequential ? objects.map((o) => (isComplete(composition, values, o) ? JSON.stringify(inputsFor(composition, values, o)) : '')) : []),
    [composition, sequential, objects, values],
  );
  const objectKeysKey = JSON.stringify(objectKeys);
  useEffect(() => {
    if (!composition || !sequential) return;
    const keys = JSON.parse(objectKeysKey) as string[];
    let cancelled = false;
    setStates(new Map(objects.map((o, i) => [o.iri, keys[i] ? { status: 'checking' } : { status: 'incomplete' }])));
    const timer = setTimeout(() => {
      objects.forEach((object, i) => {
        if (!keys[i]) return;
        client.preview(principal, object.iri, method, JSON.parse(keys[i]) as Record<string, string>).then(
          (preview) => !cancelled && setStates((m) => new Map(m).set(object.iri, { status: 'ready', preview })),
          (e: unknown) => !cancelled && setStates((m) => new Map(m).set(object.iri, { status: 'ready', reasons: reasonsOf(e) })),
        );
      });
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [client, principal, objects, method, composition, sequential, objectKeysKey]);

  useEffect(() => {
    if (!composition || sequential) return;
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
  }, [client, principal, objects, method, composition, sequential, complete, inputsKey]);

  if (error) return <ViewRenderer view={buildRefusedView(error)} host={{ onIntent: onCancel }} />;
  if (!composition) return null;

  // Both ways end the same: the objects that would succeed are committed one at a time, in order, each checked again
  // and recorded on its own (platform spec 5.4).
  async function commitAll(previews: { object: ObjectSummary; preview?: unknown; reasons?: string[] }[]) {
    setSubmitting(true);
    const done: ObjectSummary[] = [];
    const leftOut = previews.filter((p) => p.reasons).map((p) => ({ object: p.object, reasons: p.reasons! }));
    for (const { object } of previews.filter((p) => p.preview)) {
      try {
        await client.commit(principal, object.iri, method, inputsFor(composition!, values, object));
        done.push(object);
      } catch (e) {
        leftOut.push({ object, reasons: reasonsOf(e) });
      }
    }
    onDone(batchNotice(composition!, done, leftOut));
  }

  const onField = (field: string, value: string) => setValues((v) => ({ ...v, [field]: value }));
  if (sequential) {
    const previews = objects.map((object) => ({ object, ...(states.get(object.iri) ?? { status: 'incomplete' as const }) }));
    return (
      <ViewRenderer
        view={buildSequentialBatchView(composition, objects, states, values, submitting)}
        host={{
          values,
          onField,
          onIntent: async (intent) => {
            if (intent === 'cancel') return onCancel();
            if (intent !== 'submit' || submitting || previews.some((p) => p.status !== 'ready') || !previews.some((p) => 'preview' in p && p.preview)) return;
            await commitAll(previews.map((p) => ({ object: p.object, preview: 'preview' in p ? p.preview : undefined, reasons: 'reasons' in p ? p.reasons : undefined })));
          },
        }}
      />
    );
  }

  return (
    <ViewRenderer
      view={buildBatchView(composition, objects, state, submitting)}
      host={{
        values,
        onField,
        onIntent: async (intent) => {
          if (intent === 'cancel') return onCancel();
          if (intent !== 'submit' || state.status !== 'ready' || submitting || readyCount(state) === 0) return;
          await commitAll(state.previews);
        },
      }}
    />
  );
}
