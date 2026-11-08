// Minimal types for shacl-engine 1.1, which ships none.
declare module 'shacl-engine' {
  import type { DatasetCore, NamedNode, Term } from '@rdfjs/types';
  export interface ValidationResult {
    message: Term[];
    focusNode: { term: Term };
    sourceShape?: { term: Term };
  }
  export interface ValidationReport {
    conforms: boolean;
    results: ValidationResult[];
  }
  export class Validator {
    constructor(shapes: DatasetCore, options: { factory: unknown; validations?: unknown; targetResolvers?: unknown });
    validate(data: { dataset: DatasetCore; terms?: Iterable<Term> }, shapes?: { terms: NamedNode[] }[]): Promise<ValidationReport>;
  }
}
declare module 'shacl-engine/sparql.js' {
  export const validations: unknown;
  export const targetResolvers: unknown;
}
