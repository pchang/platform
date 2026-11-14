import Ajv2020 from 'ajv/dist/2020';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import * as PatternFlyCharts from '@patternfly/react-charts/victory';
import * as PatternFly from '@patternfly/react-core';
import { describe, expect, it } from 'vitest';
import { catalog, componentsById, schemas, type ViewNode } from './catalog';
import { validateNode, validateView } from './validateView';

const require = createRequire(import.meta.url);
const packageDir = (name: string) => dirname(require.resolve(`${name}/package.json`));

describe('catalog files', () => {
  const ajv = new Ajv2020({ allErrors: true, strict: true });
  ajv.addSchema(schemas.common);
  ajv.addSchema(schemas.view);

  it.each([
    ['components.json', schemas.components, catalog.files.components],
    ['tokens.json', schemas.tokens, catalog.files.tokens],
    ['patterns.json', schemas.patterns, catalog.files.patterns],
  ])('%s matches its schema', (_name, schema, data) => {
    const validate = ajv.compile(schema);
    expect(validate(data), JSON.stringify(validate.errors, null, 2)).toBe(true);
  });

  it('has unique component ids', () => {
    expect(componentsById.size).toBe(catalog.components.length);
  });
});

describe.each(catalog.components.map((c) => [c.id, c] as const))('component %s', (_id, entry) => {
  it('imports a real PatternFly export', () => {
    const pkg = entry.import.package === '@patternfly/react-charts/victory' ? PatternFlyCharts : PatternFly;
    expect(pkg).toHaveProperty(entry.import.export);
  });

  it('has a props schema that compiles', () => {
    const ajv = new Ajv2020({ strict: true });
    ajv.addSchema(schemas.common);
    expect(() => ajv.compile(entry.props)).not.toThrow();
  });

  it('accepts only children that exist in the catalog', () => {
    for (const accepted of entry.children?.accepts ?? []) {
      if (!accepted.startsWith('level:')) expect(componentsById.has(accepted), accepted).toBe(true);
    }
  });

  it('has examples that show it and validate', () => {
    const contains = (node: ViewNode): boolean => node.component === entry.id || (node.children ?? []).some(contains);
    entry.examples.forEach((example, i) => {
      expect(contains(example), `${entry.id}.examples[${i}] does not show ${entry.id}`).toBe(true);
      const result = validateNode(example, `${entry.id}.examples[${i}]`);
      expect(result.errors).toEqual([]);
    });
  });
});

describe('tokens', () => {
  const tokensDir = join(packageDir('@patternfly/react-tokens'), 'dist/esm');

  it.each(catalog.tokens)('%s exists in @patternfly/react-tokens', (name) => {
    const file = join(tokensDir, `${name.replace(/^--pf-t--/, 't_').replace(/-+/g, '_')}.js`);
    expect(existsSync(file), file).toBe(true);
    expect(readFileSync(file, 'utf8')).toContain(`"name": "${name}"`);
  });

  it('platform CSS uses only catalog tokens and no raw colors', () => {
    const cssFiles = (dir: string): string[] =>
      readdirSync(dir, { withFileTypes: true }).flatMap((d) =>
        d.isDirectory() ? cssFiles(join(dir, d.name)) : d.name.endsWith('.css') ? [join(dir, d.name)] : [],
      );
    for (const file of cssFiles('src')) {
      const css = readFileSync(file, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
      for (const [, name] of css.matchAll(/var\((--pf-t--[a-zA-Z0-9-]+)/g)) {
        expect(catalog.tokens, `${file} uses ${name}`).toContain(name);
      }
      expect(css, `${file} has a raw color`).not.toMatch(/#[0-9a-f]{3,8}\b|rgba?\(|hsla?\(/i);
    }
  });
});

describe('icons', () => {
  const iconsDir = join(packageDir('@patternfly/react-icons'), 'dist/esm/icons');
  const icon = componentsById.get('Icon')!;
  const names = (icon.props as { properties: { name: { enum: string[] } } }).properties.name.enum;

  it.each(names)('%s exists in @patternfly/react-icons', (name) => {
    expect(existsSync(join(iconsDir, `${name}-icon.js`))).toBe(true);
  });
});

describe('validateView', () => {
  const view = {
    pattern: 'card-view',
    because: 'Drug Safety Physician opened a Safety Case in triaged',
    root: {
      component: 'Stack',
      props: { hasGutter: true },
      children: [
        { component: 'StackItem', children: [{ component: 'Title', props: { label: 'SC-0007', headingLevel: 'h1' } }] },
        {
          component: 'StackItem',
          children: [
            {
              component: 'Button',
              props: { label: 'Assess', variant: 'primary' },
              action: { method: 'Assess', target: 'case:SC-0007' },
              because: 'Assess is valid: workflow is triaged',
            },
          ],
        },
      ],
    },
  };

  it('accepts a valid view', () => {
    expect(validateView(view)).toEqual({ valid: true, errors: [] });
  });

  it('rejects a component not in the catalog', () => {
    const result = validateView({ ...view, root: { component: 'Spreadsheet' } });
    expect(result.errors).toEqual(['view.root unknown component "Spreadsheet"']);
  });

  it('rejects props outside the schema', () => {
    const result = validateView({ ...view, root: { component: 'Button', props: { label: 'Go', color: '#ff0000' } } });
    expect(result.valid).toBe(false);
    expect(result.errors.join()).toContain('must NOT have additional properties');
  });

  it('rejects children a component does not accept', () => {
    const result = validateView({ ...view, root: { component: 'Stack', children: [{ component: 'Button', props: { label: 'Go' } }] } });
    expect(result.errors).toContain('view.root.children[0] Stack does not accept Button');
  });

  it('rejects children on a component that takes none', () => {
    const result = validateView({ ...view, root: { component: 'Button', props: { label: 'Go' }, children: [{ component: 'Badge', props: { label: '1' } }] } });
    expect(result.errors).toContain('view.root Button takes no children');
  });

  it('rejects a pattern not in the catalog', () => {
    expect(validateView({ ...view, pattern: 'wizard' }).errors).toEqual(['view unknown pattern "wizard"']);
  });

  it('rejects a view without a reason', () => {
    expect(validateView({ ...view, because: '' }).valid).toBe(false);
  });
});
