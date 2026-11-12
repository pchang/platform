import { useEffect, useMemo, useState } from 'react';
import { RefusedError, type CommitResult, type MethodComposition, type ObjectView, type RunView } from '../data/client';
import { usePrincipal } from '../principal/PrincipalProvider';
import { ViewRenderer } from '../renderer/Renderer';
import { buildCompareView, buildComposeView, buildRefusedView, buildSignView, buildStartView, PAGE_ARCHETYPES, SIGNATURE_FIELD, type PreviewState } from './composeView';

/** How often an open Start and track modal asks the gateway how its run is doing. */
const RUN_POLL_MS = 400;

/**
 * Runs one method on one object through its archetype's pattern (platform spec 5.4, steps 3 to 6):
 * collect the inputs, preview what will change, commit, and report the outcome to the caller.
 * Confirm and Fill in open as a modal; Compare and decide is a page that takes the caller's place.
 * Start and track stays open after the commit to follow the run until the person closes it.
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
  // Start and track: the commit that started the run, and the run as last seen.
  const [started, setStarted] = useState<CommitResult>();
  const [run, setRun] = useState<RunView>();
  const runEnded = run?.status === 'succeeded' || run?.status === 'failed';
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

  // The method's inputs: everything but the typed signature, which is not an input and never previewed.
  const inputs = useMemo(() => {
    const { [SIGNATURE_FIELD]: _typed, ...rest } = values;
    return rest;
  }, [values]);
  const inputsKey = JSON.stringify(inputs);
  // Preview as soon as every input has a value; again whenever a value changes.
  const complete = useMemo(() => Boolean(composition?.inputs.every((i) => inputs[i.name]?.trim())), [composition, inputs]);
  useEffect(() => {
    if (!composition) return;
    if (!complete) {
      setState({ status: 'incomplete' });
      return;
    }
    let cancelled = false;
    setState({ status: 'checking' });
    const timer = setTimeout(() => {
      client.preview(principal, object, method, JSON.parse(inputsKey)).then(
        (preview) => !cancelled && setState({ status: 'ready', preview }),
        (e: unknown) => !cancelled && setState({ status: 'refused', reasons: e instanceof RefusedError ? e.reasons : [String(e)] }),
      );
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [client, principal, object, method, composition, complete, inputsKey]);

  // Follow the run until it ends (design system spec 5.1, Start and track, steps 4 and 5).
  const runId = run?.run;
  useEffect(() => {
    if (!runId || runEnded) return;
    let cancelled = false;
    const timer = setInterval(() => {
      client.run(principal, runId).then((r) => !cancelled && setRun(r), () => undefined);
    }, RUN_POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [client, principal, runId, runEnded]);

  // The method cannot be composed for this person, such as when their role cannot run it: say why.
  if (error) return <ViewRenderer view={buildRefusedView(error)} host={{ onIntent: onCancel }} />;
  if (!composition) return null;

  if (isPage && !self) return null;
  const isStart = composition.archetype.label === 'Start and track';
  const view = isPage
    ? buildCompareView(composition, state, self!, other, submitting)
    : isStart
      ? buildStartView(composition, state, run, submitting)
      : composition.signature
      ? buildSignView(composition, state, values, submitting)
      : buildComposeView(composition, state, submitting);
  return (
    <ViewRenderer
      view={view}
      host={{
        values,
        onField: (field, value) => setValues((v) => ({ ...v, [field]: value })),
        onIntent: (intent) => {
          // Closing a started run's modal leaves the run going, and reports it as last seen.
          if (intent === 'cancel') return started ? onDone(composition, { ...started, run }) : onCancel();
          if (state.status !== 'ready' || submitting) return;
          setSubmitting(true);
          const signature = composition.signature ? { typedName: values[SIGNATURE_FIELD] ?? '' } : undefined;
          client.commit(principal, object, method, inputs, signature).then(
            (result) => {
              if (!result.run) return onDone(composition, result);
              setStarted(result);
              setRun(result.run);
            },
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
