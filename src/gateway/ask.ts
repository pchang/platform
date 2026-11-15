/**
 * Asking a question (platform spec 5.2, Asking a question): what the gateway gives a connected model, and what the model
 * gives back. Browser-safe: the gateway owns the tools and what they read; a model only drives them and answers.
 */

/** A read-only tool the model may call, described as JSON Schema. Each runs as one gateway request, as the principal. */
export interface AskTool {
  name: string;
  description: string;
  input_schema: { type: 'object'; properties: Record<string, unknown>; required: string[]; additionalProperties: false };
}

/** The outcome of one tool call: what the model reads, and whether the gateway refused it. */
export interface AskToolOutput {
  content: string;
  isError?: boolean;
}

/** The gateway's tools for one question, bound to the principal who asked it. */
export interface AskToolbox {
  tools: AskTool[];
  run(name: string, input: unknown): Promise<AskToolOutput>;
}

/** An earlier turn of the conversation: what the person asked, and the text of what they were answered. Never records. */
export interface AskTurn {
  question: string;
  answer: string;
}

/** How many earlier turns go with a question, and how long each part may be. */
export const MAX_TURNS = 10;
export const MAX_TURN_LENGTH = 4000;

/** Keeps earlier turns to their shape and limits, the latest ones last; anything else is dropped. */
export function checkTurns(turns: unknown): AskTurn[] {
  if (!Array.isArray(turns)) return [];
  return turns
    .filter((t): t is AskTurn => Boolean(t) && typeof t.question === 'string' && typeof t.answer === 'string' && Boolean(t.question.trim()))
    .slice(-MAX_TURNS)
    .map((t) => ({ question: t.question.slice(0, MAX_TURN_LENGTH), answer: t.answer.trim().slice(0, MAX_TURN_LENGTH) || 'No answer was given.' }));
}

export interface AskRequest {
  question: string;
  /** The conversation so far, oldest first (spec 5.2, In a conversation). What was said, never records. */
  earlier: AskTurn[];
  /** Who is asking, today's date, and the vocabulary they may read: never a record. Records come only through the tools. */
  context: string;
  toolbox: AskToolbox;
  /** How many turns the model may take, tool calls included, before it must answer. */
  maxSteps: number;
}

export type AnswerStatus = 'answered' | 'needs more' | 'cannot answer';

/** What the model ends with: its words, whether it answered, and the identifiers it says the answer rests on. */
export interface ModelAnswer {
  status: AnswerStatus;
  text: string;
  cited: string[];
  /** The model that answered, as the provider reports it. */
  model: string;
}

/** A connected model that answers questions through the gateway's tools. Rejects when it fails or declines. */
export interface AskModel {
  readonly model: string;
  answer(request: AskRequest): Promise<ModelAnswer>;
}

/** The tool the model ends with. Defined here so every model ends the same way. */
export const ANSWER_TOOL: AskTool = {
  name: 'give_answer',
  description:
    'Ends the question with your answer to the person. Call it exactly once, last. Set status to "answered" when you answered, "needs more" when you need the person to say more (ask them, in text), or "cannot answer" when what they may read does not hold the answer. List in cited the identifiers of the objects your answer rests on, only ones you read through the other tools.',
  input_schema: {
    type: 'object',
    properties: {
      status: { type: 'string', enum: ['answered', 'needs more', 'cannot answer'] },
      text: { type: 'string', description: 'The answer, in plain sentences for the person. Short paragraphs, no markdown, no headings.' },
      cited: { type: 'array', items: { type: 'string' }, description: 'Identifiers of the objects the answer rests on, such as AE-003.' },
    },
    required: ['status', 'text', 'cited'],
    additionalProperties: false,
  },
};

/** Reads a give_answer call's input, rejecting anything not in its shape. */
export function parseAnswer(input: unknown): Omit<ModelAnswer, 'model'> {
  const value = input as { status?: unknown; text?: unknown; cited?: unknown };
  const statuses: AnswerStatus[] = ['answered', 'needs more', 'cannot answer'];
  if (!value || typeof value !== 'object') throw new Error('The answer is not an object');
  if (!statuses.includes(value.status as AnswerStatus)) throw new Error('The answer has no valid status');
  if (typeof value.text !== 'string' || !value.text.trim()) throw new Error('The answer has no text');
  if (!Array.isArray(value.cited) || value.cited.some((c) => typeof c !== 'string')) throw new Error('The answer cites no list of identifiers');
  return { status: value.status as AnswerStatus, text: value.text.trim(), cited: value.cited as string[] };
}
