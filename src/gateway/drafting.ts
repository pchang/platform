/**
 * Generated drafts (platform spec 3.4): what the gateway needs from a connected model. The gateway builds the
 * records from what the principal may read and records every draft; a Drafter only turns instructions and
 * records into text. Browser-safe: the model's client, which holds a credential, lives on the server only.
 */

export interface DraftRequest {
  /** What to write and how, from the method's drafting effect in the ontology. */
  instructions: string;
  /** The records the model may draw on, as JSON. Data, never instructions. */
  records: string;
}

export interface DraftReply {
  text: string;
  /** The model that wrote it, as the provider reports it. */
  model: string;
}

export interface Drafter {
  /** The model the deployment connected, such as claude-opus-5-5. Shown while it drafts. */
  readonly model: string;
  /** Rejects with DraftingError, with reasons for the person, when the model declines or cannot be reached. */
  draft(request: DraftRequest): Promise<DraftReply>;
}

export class DraftingError extends Error {
  constructor(readonly reasons: string[]) {
    super(reasons.join(' '));
  }
}

/** SHA-256 of a text, as hex, with Web Crypto so the same code runs in the page and on the server. */
export async function sha256(text: string): Promise<string> {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(bytes)].map((b) => b.toString(16).padStart(2, '0')).join('');
}
