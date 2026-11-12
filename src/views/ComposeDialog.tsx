import { useEffect, useMemo, useRef, useState } from 'react';
import type { ViewNode } from '../design-system/catalog';
import { RefusedError, type CommitResult, type DraftView, type MethodComposition, type ObjectView, type RunView } from '../data/client';
import type { ProcessRecord, ProcessSnapshot } from '../processes/processes';
import { usePrincipal } from '../principal/PrincipalProvider';
import { ViewRenderer } from '../renderer/Renderer';
import {
  buildCompareView,
  buildComposeView,
  buildDraftView,
  buildRefusedView,
  buildSignView,
  buildStartView,
  discardedNotice,
  DRAFT_FIELD,
  PAGE_ARCHETYPES,
  processProgress,
  SIGNATURE_FIELD,
  type DraftState,
  type PreviewState,
} from './composeView';

const reasonsOf = (e: unknown) => (e instanceof RefusedError ? e.reasons : [String(e)]);

/** How often an open Start and track modal asks the gateway how its run is doing. */
const RUN_POLL_MS = 400;

/**
 * Runs one method on one object through its archetype's pattern (platform spec 5.4, steps 3 to 6):
 * collect the inputs, preview what will change, commit, and report the outcome to the caller.
 * Confirm and Fill in open as a modal; Compare and decide is a page that takes the caller's place.
 * Start and track stays open after the commit to follow the run until the person closes it.
 * Review a draft is a page that asks for the draft at once, then lets the person decide on it.
 */
export function ComposeDialog({
  object,
  method,
  onDone,
  onCancel,
  process,
  onChange,
  onMinimize,
}: {
  object: string;
  method: string;
  onDone: (composition: MethodComposition, result: CommitResult) => void;
  /** Closes without a commit; with a notice when something was still recorded, such as a discarded draft. */
  onCancel: (notice?: ViewNode) => void;
  /** What was given before the process was set aside, to carry on from (platform spec 5.4, Several at once). */
  process?: ProcessRecord;
  /** Reports what has been given and how far along it is, so it can be kept while set aside. */
  onChange?: (snapshot: Partial<ProcessSnapshot>) => void;
  /** Sets the process aside in the dock. */
  onMinimize?: () => void;
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
  const isDraft = composition?.archetype.label === 'Review a draft';
  const isCompare = isPage && !isDraft;
  const picked = composition?.inputs.find((i) => i.kind === 'object');
  const pickedValue = picked ? values[picked.name] : undefined;

  useEffect(() => {
    if (!isCompare) return;
    let cancelled = false;
    client.read(principal, object).then((v) => !cancelled && setSelf(v));
    return () => {
      cancelled = true;
    };
  }, [client, principal, object, isCompare]);

  useEffect(() => {
    if (!isCompare || !pickedValue) {
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
  }, [client, principal, isCompare, pickedValue]);

  useEffect(() => {
    let cancelled = false;
    client.compose(principal, object, method).then(
      (c) => {
        if (cancelled) return;
        setComposition(c);
        // Defaults first, then whatever the person gave before setting the process aside.
        setValues({ ...Object.fromEntries(c.inputs.filter((i) => i.default).map((i) => [i.name, i.default!])), ...(process?.values ?? {}) });
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
    // A draft's commit needs the draft, so Review a draft previews nothing until the person accepts.
    if (!composition || composition.archetype.label === 'Review a draft') return;
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

  // A restored Start and track process picks up its run where it is now.
  useEffect(() => {
    if (!process?.run) return;
    let cancelled = false;
    client.run(principal, process.run).then((r) => {
      if (cancelled) return;
      setRun(r);
      setStarted({ commit: '', changes: [], created: [], pending: [], pendingDescriptions: [], background: [], run: r });
    }, () => undefined);
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [client, principal]);

  // Keep what has been given, and how far along it is, for the dock.
  useEffect(() => {
    if (!composition || composition.archetype.label === 'Review a draft') return;
    onChange?.({ values, run: run?.run, progress: processProgress(composition, state, values, { run }) });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [composition, values, state, run]);

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
  if (error) return <ViewRenderer view={buildRefusedView(error)} host={{ onIntent: () => onCancel() }} />;
  if (!composition) return null;

  if (isDraft) return <DraftPage composition={composition} onDone={onDone} onCancel={onCancel} process={process} onChange={onChange} onMinimize={onMinimize} />;
  if (isPage && !self) return null;
  const isStart = composition.archetype.label === 'Start and track';
  const view = isPage
    ? buildCompareView(composition, state, self!, other, submitting, Boolean(onMinimize))
    : isStart
      ? buildStartView(composition, state, run, submitting, Boolean(onMinimize))
      : composition.signature
      ? buildSignView(composition, state, values, submitting, Boolean(onMinimize))
      : buildComposeView(composition, state, submitting, Boolean(onMinimize));
  return (
    <ViewRenderer
      view={view}
      host={{
        values,
        onField: (field, value) => setValues((v) => ({ ...v, [field]: value })),
        onIntent: (intent) => {
          if (intent === 'minimize') return onMinimize?.();
          // Closing a started run's modal leaves the run going, and reports it as last seen.
          if (intent === 'cancel') return started ? onDone(composition, { ...started, run }) : onCancel();
          if (intent !== 'submit') return;
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

/**
 * Review a draft (design system spec 5.1): asks the gateway for the draft as soon as it opens, shows it marked as
 * generated, and lets the person accept it as written or edited, discard it, or go back without deciding.
 */
function DraftPage({
  composition,
  onDone,
  onCancel,
  process,
  onChange,
  onMinimize,
}: {
  composition: MethodComposition;
  onDone: (composition: MethodComposition, result: CommitResult) => void;
  onCancel: (notice?: ViewNode) => void;
  process?: ProcessRecord;
  onChange?: (snapshot: Partial<ProcessSnapshot>) => void;
  onMinimize?: () => void;
}) {
  const { client, principal } = usePrincipal();
  const [state, setState] = useState<DraftState>({ status: 'drafting' });
  const [editing, setEditing] = useState(Boolean(process?.editing));
  const [values, setValues] = useState<Record<string, string>>(process?.values ?? {});
  const [submitting, setSubmitting] = useState(false);
  const [problems, setProblems] = useState<string[]>();
  // One request per page: each draft is a paid call to the model and is recorded, so a remount must not ask again.
  const request = useRef<Promise<DraftView>>(undefined);

  useEffect(() => {
    let cancelled = false;
    // A restored process reads back the draft it already has: asking again would write, and pay for, another.
    request.current ??= process?.draft ? client.getDraft(principal, process.draft) : client.draft(principal, composition.object.iri, composition.method);
    request.current.then(
      (draft) => !cancelled && setState({ status: 'ready', draft }),
      (e: unknown) => !cancelled && setState({ status: 'refused', reasons: reasonsOf(e) }),
    );
    return () => {
      cancelled = true;
    };
  }, [client, principal, composition]);

  useEffect(() => {
    onChange?.({
      values,
      editing,
      ...(state.status === 'ready' ? { draft: state.draft.draft } : {}),
      progress: processProgress(composition, { status: 'incomplete' }, values, { draft: state, editing }),
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state, editing, values]);

  const view = buildDraftView(composition, state, { editing, editedText: values[DRAFT_FIELD], submitting, problems, minimizable: Boolean(onMinimize) });
  return (
    <ViewRenderer
      view={view}
      host={{
        values,
        onField: (field, value) => setValues((v) => ({ ...v, [field]: value })),
        onIntent: (intent) => {
          if (intent === 'cancel') return onCancel();
          if (intent === 'minimize') return onMinimize?.();
          if (state.status !== 'ready' || submitting) return;
          const { draft } = state;
          if (intent === 'edit') {
            setEditing(true);
            setValues((v) => (v[DRAFT_FIELD] !== undefined ? v : { [DRAFT_FIELD]: draft.text }));
            return;
          }
          setSubmitting(true);
          setProblems(undefined);
          const failed = (e: unknown) => {
            setSubmitting(false);
            setProblems(reasonsOf(e));
          };
          if (intent === 'discard') {
            client.discardDraft(principal, draft.draft).then((d) => onCancel(discardedNotice(d)), failed);
            return;
          }
          const text = editing ? (values[DRAFT_FIELD] ?? '') : draft.text;
          client.commit(principal, composition.object.iri, composition.method, {}, undefined, { draft: draft.draft, text }).then((result) => onDone(composition, result), failed);
        },
      }}
    />
  );
}
