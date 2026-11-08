import Ajv2020, { type ValidateFunction } from 'ajv/dist/2020';
import { catalog, componentsById, schemas, type ViewNode, type ViewSpec } from './catalog';

/**
 * Validates view specs against the catalog (design system spec, section 5.2).
 * The renderer draws nothing that fails here: an invalid spec is rejected whole.
 */
const ajv = new Ajv2020({ allErrors: true, strict: true });
ajv.addSchema(schemas.common);
ajv.addSchema(schemas.view);

const validateViewShape = ajv.getSchema('view.schema.json')!;
const validateNodeShape = ajv.getSchema('view.schema.json#/$defs/node')!;

const propValidators = new Map<string, ValidateFunction>();
function propsValidator(id: string): ValidateFunction {
  let validate = propValidators.get(id);
  if (!validate) {
    validate = ajv.compile(componentsById.get(id)!.props);
    propValidators.set(id, validate);
  }
  return validate;
}

function ajvErrors(validate: ValidateFunction, at: string): string[] {
  return (validate.errors ?? []).map((e) => `${at}${e.instancePath} ${e.message}`);
}

function accepts(parentId: string, child: ViewNode): boolean {
  const rule = componentsById.get(parentId)?.children;
  const childEntry = componentsById.get(child.component);
  if (!rule || !childEntry) return false;
  return rule.accepts.includes(child.component) || rule.accepts.includes(`level:${childEntry.level}`);
}

function checkNode(node: ViewNode, at: string): string[] {
  const entry = componentsById.get(node.component);
  if (!entry) return [`${at} unknown component "${node.component}"`];

  const errors: string[] = [];
  const validateProps = propsValidator(entry.id);
  if (!validateProps(node.props ?? {})) errors.push(...ajvErrors(validateProps, `${at}.props`));

  const children = node.children ?? [];
  if (entry.children === null) {
    if (children.length) errors.push(`${at} ${entry.id} takes no children`);
  } else {
    const { minItems, maxItems } = entry.children;
    if (minItems !== undefined && children.length < minItems) errors.push(`${at} ${entry.id} needs at least ${minItems} children`);
    if (maxItems !== undefined && children.length > maxItems) errors.push(`${at} ${entry.id} takes at most ${maxItems} children`);
  }
  children.forEach((child, i) => {
    const childAt = `${at}.children[${i}]`;
    if (componentsById.has(child.component) && !accepts(entry.id, child)) {
      errors.push(`${childAt} ${entry.id} does not accept ${child.component}`);
    }
    errors.push(...checkNode(child, childAt));
  });
  return errors;
}

export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

export function validateNode(node: unknown, at = 'node'): ValidationResult {
  if (!validateNodeShape(node)) return { valid: false, errors: ajvErrors(validateNodeShape, at) };
  const errors = checkNode(node as ViewNode, at);
  return { valid: errors.length === 0, errors };
}

export function validateView(view: unknown): ValidationResult {
  if (!validateViewShape(view)) return { valid: false, errors: ajvErrors(validateViewShape, 'view') };
  const spec = view as ViewSpec;
  const errors: string[] = [];
  if (!catalog.patterns.some((p) => p.id === spec.pattern)) errors.push(`view unknown pattern "${spec.pattern}"`);
  errors.push(...checkNode(spec.root, 'view.root'));
  return { valid: errors.length === 0, errors };
}
