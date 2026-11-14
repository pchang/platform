import commonSchema from '../../design-system/schema/common.schema.json';
import componentsSchema from '../../design-system/schema/components.schema.json';
import patternsSchema from '../../design-system/schema/patterns.schema.json';
import tokensSchema from '../../design-system/schema/tokens.schema.json';
import viewSchema from '../../design-system/view.schema.json';
import componentsFile from '../../design-system/components.json';
import patternsFile from '../../design-system/patterns.json';
import tokensFile from '../../design-system/tokens.json';

export type Level = 'atom' | 'molecule' | 'organism' | 'layout' | 'template';

export interface CatalogComponent {
  id: string;
  level: Level;
  import: { package: string; export: string };
  purpose: string;
  useWhen: string[];
  avoidWhen: string[];
  props: Record<string, unknown>;
  children: null | { accepts: string[]; minItems?: number; maxItems?: number };
  responsive: string;
  accessibility: string[];
  examples: ViewNode[];
  overlay?: boolean;
}

/** A button's role in an interaction (design system spec 5.2). */
export type Intent = 'submit' | 'cancel' | 'edit' | 'discard' | 'minimize';

export interface ViewNode {
  component: string;
  props?: Record<string, unknown>;
  bind?: string;
  action?: { method: string; target: string };
  because?: string;
  field?: string;
  intent?: Intent;
  /** A graph object the node opens in the object panel (design system spec 4.4). Only on a Card or a Button. */
  opens?: string;
  children?: ViewNode[];
}

export interface ViewSpec {
  pattern: string;
  because: string;
  root: ViewNode;
}

export const schemas = {
  common: commonSchema,
  components: componentsSchema,
  patterns: patternsSchema,
  tokens: tokensSchema,
  view: viewSchema,
};

export const catalog = {
  components: componentsFile.components as CatalogComponent[],
  patterns: patternsFile.patterns as { id: string }[],
  tokens: tokensFile.groups.flatMap((group) => group.tokens.map((token) => token.name)),
  files: { components: componentsFile, patterns: patternsFile, tokens: tokensFile },
};

export const componentsById = new Map(catalog.components.map((c) => [c.id, c]));
