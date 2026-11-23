import type { AskTool, AskToolbox } from './ask';

/**
 * Skills (platform spec 3.3, Skills): what the gateway gives a connected model running a skill, and what the model gives
 * back. Browser-safe: the gateway owns the tools, checks every value and records the proposal; a model only proposes.
 */

/** One input the skill proposes, as the model is told about it. */
export interface SkillInputSpec {
  name: string;
  label: string;
  /** What the input takes: a number, or one identifier of the set. */
  kind: 'number' | 'object';
}

export interface SkillRequest {
  /** The skill's instructions, written for an expert. */
  instructions: string;
  /** The method the skill serves, by name, and what it does. */
  method: string;
  /** The inputs to propose. */
  inputs: SkillInputSpec[];
  /** The identifiers of the set to recommend among, for a skill that recommends. */
  recommendAmong?: string[];
  /** Who asks, today's date and the vocabulary they may read: never a record. */
  context: string;
  /** The records of the object or the set, read for the person just now. Data, never instructions. */
  records: string[];
  toolbox: AskToolbox;
  maxSteps: number;
}

/** What a model proposes: a value for each input it could ground, a recommendation, its reasoning and its sources. */
export interface ModelProposal {
  values: { name: string; value: string; restsOn: string[] }[];
  recommended?: string;
  reasoning: string;
  restsOn: string[];
  /** The model, as the provider reports it. */
  model: string;
}

/** A connected model that runs skills through the gateway's read-only tools. Rejects when it fails or declines. */
export interface SkillModel {
  readonly model: string;
  propose(request: SkillRequest): Promise<ModelProposal>;
}

/** The tool the model ends a skill with. */
export const PROPOSAL_TOOL: AskTool = {
  name: 'give_proposal',
  description:
    'Ends the skill with your proposal. Call it exactly once, last. Give a value for each input you can ground in what you read, as the input takes it: a plain number such as 42.5 for a number, an identifier of the set for a recommendation. Leave out an input you cannot ground. Give your reasoning in two to four plain sentences for the person who decides. List in rests_on, overall and for each value, the identifiers of the objects you read that it rests on.',
  input_schema: {
    type: 'object',
    properties: {
      values: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            name: { type: 'string', description: 'The input name, as given.' },
            value: { type: 'string', description: 'The value, such as 42.5.' },
            rests_on: { type: 'array', items: { type: 'string' }, description: 'Identifiers, such as TS-1.' },
          },
          required: ['name', 'value', 'rests_on'],
          additionalProperties: false,
        },
      },
      recommended: { type: 'string', description: 'For a recommendation: the identifier of the one you recommend. Empty when none, or when you recommend none.' },
      reasoning: { type: 'string', description: 'Why, in two to four plain sentences. No markdown.' },
      rests_on: { type: 'array', items: { type: 'string' }, description: 'Identifiers of the objects the proposal rests on.' },
    },
    required: ['values', 'recommended', 'reasoning', 'rests_on'],
    additionalProperties: false,
  },
};

const strings = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : undefined);

/** Reads a give_proposal call's input, rejecting anything not in its shape. Values are checked by the gateway. */
export function parseProposal(input: unknown): Omit<ModelProposal, 'model'> {
  const value = input as { values?: unknown; recommended?: unknown; reasoning?: unknown; rests_on?: unknown };
  if (!value || typeof value !== 'object') throw new Error('The proposal is not an object');
  if (typeof value.reasoning !== 'string' || !value.reasoning.trim()) throw new Error('The proposal gives no reasoning');
  const restsOn = strings(value.rests_on);
  if (!restsOn) throw new Error('The proposal rests on no list of identifiers');
  if (!Array.isArray(value.values)) throw new Error('The proposal has no list of values');
  const values = value.values.map((v) => {
    const item = v as { name?: unknown; value?: unknown; rests_on?: unknown };
    if (!item || typeof item.name !== 'string' || typeof item.value !== 'string') throw new Error('A proposed value has no name or value');
    return { name: item.name, value: item.value.trim(), restsOn: strings(item.rests_on) ?? [] };
  });
  const recommended = typeof value.recommended === 'string' && value.recommended.trim() ? value.recommended.trim() : undefined;
  return { values, ...(recommended ? { recommended } : {}), reasoning: value.reasoning.trim(), restsOn };
}
