import type * as oxigraph from 'oxigraph';
import type { Literal, NamedNode } from 'oxigraph';
import { referenceTrialModel } from './referenceTrialModel';

/** A value a model returns: an object or a literal. */
export type Term = NamedNode | Literal;

/**
 * Connected models (platform spec 3.4, Model runs). A model run names its model in the ontology; the gateway runs it
 * on the method's object and commits what it returns, after validating every shape. Only models registered here are
 * connected: a model run whose model is not here cannot start, and the platform never pretends to run it.
 */

/** An object a model asks the gateway to create. `key` names it within the result, so other results can link to it. */
export interface ModelCreation {
  key: string;
  type: string;
  /** Property values, as RDF terms. A link to another created object uses `{ key }`. */
  values: { property: string; value: Term | { key: string } }[];
}

/** A value a model asks the gateway to set on an existing object, replacing what was there. */
export interface ModelSetting {
  subject: string;
  property: string;
  value: Term;
}

export interface ModelResult {
  /** What the run found, in words, for the person's notification. */
  message: string;
  creates: ModelCreation[];
  sets: ModelSetting[];
}

export interface ModelRequest {
  /** The graph as it stands when the run starts. The model only reads it. */
  store: oxigraph.Store;
  /** The method's object. */
  target: string;
  /** The person's inputs, by input name, as given: many values separated by spaces. */
  inputs: Record<string, string>;
  /** When the run started. */
  at: Date;
}

export interface Model {
  name: string;
  version: string;
  /** A reference model is transparent and reproducible but not validated for decisions; every result says so. */
  reference: boolean;
  /** Runs the model. Throws an Error whose message says, in words, why it cannot run. */
  run(request: ModelRequest): ModelResult;
}

/** The models the gateway connects, by name. */
export const CONNECTED_MODELS: ReadonlyMap<string, Model> = new Map([[referenceTrialModel.name, referenceTrialModel]]);
