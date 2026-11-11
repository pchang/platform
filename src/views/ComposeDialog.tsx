import { useEffect, useMemo, useState } from 'react';
import { RefusedError, type CommitResult, type MethodComposition, type ObjectView } from '../data/client';
import { usePrincipal } from '../principal/PrincipalProvider';
import { ViewRenderer } from '../renderer/Renderer';
import { buildCompareView, buildComposeView, buildRefusedView, PAGE_ARCHETYPES, type PreviewState } from './composeView';

/**
 * Runs one method on one object through its archetype's pattern (platform spec 5.4, steps 3 to 6):
 * collect the inputs, preview what will change, commit, and report the outcome to the caller.
 * Confirm and Fill in open as a modal; Compare and decide is a page that takes the caller's place.
 */
export function ComposeDialog({
  object,
  method,
  onDone,
  onCancel,
}: {
  object: string;
  method: string;
  onDone: (composition: MethodComposition, result: CommitResult) => void;
  onCancel: () => void;
}) {
  const { client, principal } = usePrincipal();
  const [composition, setComposition] = useState<MethodComposition>();
  const [values, setValues] = useState<Record<string, string>>({});
  const [state, setState] = useState<PreviewState>({ status: 'incomplete' });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string[]>();
  // Compare and decide: the object and the one chosen, as the gateway lets this person read them.
  const [self, setSelf] = useState<ObjectView>();
  const [other, setOther] = useState<ObjectView>();
  const isPage = Boolean(composition && PAGE_ARCHETYPES.has(composition.archetype.label));
  const picked = composition?.inputs.find((i) => i.kind === 'object');
  const pickedValue = picked ? values[picked.name] : undefined;

  useEffect(() => {
    if (!isPage) return;
    let cancelled = false;
    client.read(principal, object).then((v) => !cancelled && setSelf(v));
    return () => {
      cancelled = true;
    };
  }, [client, principal, object, isPage]);

  useEffect(() => {
    if (!isPage || !pickedValue) {
      setOther(undefined);
      return;
    }
    let cancelled = false;
    client.read(principal, pickedValue).then(
      (v) => !cancelled && setOther(v),
      () => !cancelled && setOther(undefined),
    );
    return () => {
      cancelled = true;
    };
  }, [client, principal, isPage, pickedValue]);

  useEffect(() => {
    let cancelled = false;
    client.compose(principal, object, method).then(
      (c) => {
        if (cancelled) return;
        setComposition(c);
        setValues(Object.fromEntries(c.inputs.filter((i) => i.default).map((i) => [i.name, i.default!])));
      },
      (e: unknown) => !cancelled && setError(e instanceof RefusedError ? e.reasons : [String(e)]),
    );
    return () => {
      cancelled = true;
    };
  }, [client, principal, object, method]);

  // Preview as soon as every input has a value; again whenever a value changes.
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
      client.preview(principal, object, method, values).then(
        (preview) => !cancelled && setState({ status: 'ready', preview }),
        (e: unknown) => !cancelled && setState({ status: 'refused', reasons: e instanceof RefusedError ? e.reasons : [String(e)] }),
      );
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [client, principal, object, method, composition, complete, values]);

  // The method cannot be composed for this person, such as when their role cannot run it: say why.
  if (error) return <ViewRenderer view={buildRefusedView(error)} host={{ onIntent: onCancel }} />;
  if (!composition) return null;

  if (isPage && !self) return null;
  const view = isPage ? buildCompareView(composition, state, self!, other, submitting) : buildComposeView(composition, state, submitting);
  return (
    <ViewRenderer
      view={view}
      host={{
        values,
        onField: (field, value) => setValues((v) => ({ ...v, [field]: value })),
        onIntent: (intent) => {
          if (intent === 'cancel') return onCancel();
          if (state.status !== 'ready' || submitting) return;
          setSubmitting(true);
          client.commit(principal, object, method, values).then(
            (result) => onDone(composition, result),
            (e: unknown) => {
              setSubmitting(false);
              setState({ status: 'refused', reasons: e instanceof RefusedError ? e.reasons : [String(e)] });
            },
          );
        },
      }}
    />
  );
}
