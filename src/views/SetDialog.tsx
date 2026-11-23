import { useEffect, useRef, useState } from 'react';
import type { ViewNode } from '../design-system/catalog';
import { RefusedError, type MethodComposition, type ObjectSummary } from '../data/client';
import { usePrincipal } from '../principal/PrincipalProvider';
import { ViewRenderer } from '../renderer/Renderer';
import { buildRefusedView } from './composeView';
import { buildSetView, setNotice, type SetPreview } from './setView';
import { fillEmpty, leadingProposal, type ProposalState } from './proposalView';
import type { SkillProposals } from '../data/client';

const reasonsOf = (e: unknown) => (e instanceof RefusedError ? e.reasons : [String(e)]);

/**
 * Runs a set method (platform spec 5.4, Acting on a set; design system spec 4.3, Set actions): the set side by side with
 * its comparison, the decision, its preview, then one commit for the whole set. Reports the outcome as a notice.
 */
export function SetDialog({
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
  const [state, setState] = useState<SetPreview>({ status: 'incomplete' });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string[]>();
  const [proposal, setProposal] = useState<ProposalState>({ status: 'none' });
  // One request per dialog: each proposal is recorded, and with a model each is a paid call.
  const proposing = useRef<Promise<SkillProposals>>(undefined);
  const ids = objects.map((o) => o.iri);
  const idsKey = ids.join('|');

  useEffect(() => {
    let cancelled = false;
    client.composeSet(principal, idsKey.split('|'), method).then(
      (c) => !cancelled && setComposition(c),
      (e: unknown) => !cancelled && setError(reasonsOf(e)),
    );
    return () => {
      cancelled = true;
    };
  }, [client, principal, idsKey, method]);

  // Skills propose once the composition says there are any (platform spec 3.3, Skills): the recommendation pre-selects the
  // choice, unless the person has already chosen. The rationale is never proposed.
  const hasSkills = Boolean(composition?.skills?.length);
  useEffect(() => {
    if (!hasSkills) return;
    let cancelled = false;
    setProposal({ status: 'working' });
    proposing.current ??= client.propose(principal, idsKey.split('|'), method);
    proposing.current.then(
      (result) => {
        if (cancelled) return;
        const state: ProposalState = { status: 'ready', result };
        setProposal(state);
        setValues((v) => fillEmpty(v, leadingProposal(state)));
      },
      (e: unknown) => !cancelled && setProposal({ status: 'failed', reasons: reasonsOf(e) }),
    );
    return () => {
      cancelled = true;
    };
  }, [client, principal, idsKey, method, hasSkills]);

  const inputsKey = JSON.stringify(values);
  const complete = Boolean(composition?.inputs.every((i) => values[i.name]?.trim()));
  useEffect(() => {
    if (!composition) return;
    if (!complete) {
      setState({ status: 'incomplete' });
      return;
    }
    let cancelled = false;
    setState({ status: 'checking' });
    const timer = setTimeout(() => {
      client.previewSet(principal, idsKey.split('|'), method, JSON.parse(inputsKey) as Record<string, string>).then(
        (preview) => !cancelled && setState({ status: 'ready', preview }),
        (e: unknown) => !cancelled && setState({ status: 'refused', reasons: reasonsOf(e) }),
      );
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [client, principal, idsKey, method, composition, complete, inputsKey]);

  if (error) return <ViewRenderer view={buildRefusedView(error)} host={{ onIntent: onCancel }} />;
  if (!composition) return null;

  return (
    <ViewRenderer
      view={buildSetView(composition, state, submitting, values, proposal)}
      host={{
        values,
        onField: (field, value) => setValues((v) => ({ ...v, [field]: value })),
        onIntent: async (intent) => {
          if (intent === 'cancel') return onCancel();
          if (intent !== 'submit' || state.status !== 'ready' || submitting) return;
          setSubmitting(true);
          try {
            const chosen = composition.inputs.find((i) => i.kind === 'object')?.name;
            const result = await client.commitSet(principal, ids, method, values, leadingProposal(proposal)?.proposal ?? (proposal.status === 'ready' ? proposal.result.proposals[0]?.proposal : undefined));
            onDone(setNotice(composition, chosen ? values[chosen] : '', result));
          } catch (e) {
            setSubmitting(false);
            setState({ status: 'refused', reasons: reasonsOf(e) });
          }
        },
      }}
    />
  );
}
