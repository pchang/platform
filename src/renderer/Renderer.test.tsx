import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest';
import { catalog, componentsById, type ViewNode, type ViewSpec } from '../design-system/catalog';
import { icons } from './icons';
import { library } from './library';
import { ViewRenderer } from './Renderer';

const view = (root: ViewNode): ViewSpec => ({ pattern: 'card-view', because: 'test', root });

let consoleError: MockInstance;
beforeEach(() => {
  consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => consoleError.mockRestore());

describe('ViewRenderer', () => {
  it('has an icon for every name the catalog allows, and no others', () => {
    const allowed = (componentsById.get('Icon')!.props as { properties: { name: { enum: string[] } } }).properties.name.enum;
    expect(Object.keys(icons).sort()).toEqual([...allowed].sort());
  });

  it('bundles exactly the PatternFly components the catalog allows', () => {
    const exports = [...new Set(catalog.components.map((c) => c.import.export))].sort();
    expect(Object.keys(library).sort()).toEqual(exports);
  });

  describe.each(catalog.components.map((c) => [c.id, c] as const))('%s', (_id, entry) => {
    it('renders every example without errors or warnings', () => {
      for (const example of entry.examples) {
        const { container, unmount } = render(<ViewRenderer view={view(example)} />);
        expect(container).not.toBeEmptyDOMElement();
        unmount();
      }
      expect(consoleError).not.toHaveBeenCalled();
    });
  });

  it('draws nothing for an invalid view and reports why', () => {
    const onInvalid = vi.fn();
    const { container } = render(<ViewRenderer view={view({ component: 'Wizard' })} host={{ onInvalid }} />);
    expect(container).toBeEmptyDOMElement();
    expect(onInvalid).toHaveBeenCalledWith(['view.root unknown component "Wizard"']);
  });

  it('runs an action through the host handler', async () => {
    const onAction = vi.fn();
    const node: ViewNode = { component: 'Button', props: { label: 'Assess' }, action: { method: 'Assess', target: 'case:SC-0007' } };
    render(<ViewRenderer view={view(node)} host={{ onAction }} />);
    await userEvent.click(screen.getByRole('button', { name: 'Assess' }));
    expect(onAction).toHaveBeenCalledWith(node.action, node);
  });

  it('connects form labels to their controls', () => {
    render(
      <ViewRenderer
        view={view({
          component: 'Stack',
          children: [
            { component: 'StackItem', children: [{ component: 'Checkbox', props: { label: 'Include resolved' } }] },
            { component: 'StackItem', children: [{ component: 'Switch', props: { label: 'Show unblinded' } }] },
          ],
        })}
      />,
    );
    expect(screen.getByLabelText('Include resolved')).toHaveAttribute('type', 'checkbox');
    expect(screen.getByLabelText('Show unblinded')).toHaveAttribute('type', 'checkbox');
  });

  it('exposes named icons as images', () => {
    render(<ViewRenderer view={view({ component: 'Icon', props: { name: 'bell', 'aria-label': 'Alerts' } })} />);
    expect(screen.getByRole('img', { name: 'Alerts' })).toBeInTheDocument();
  });

  it('hides decorative icons from screen readers', () => {
    const { container } = render(<ViewRenderer view={view({ component: 'Icon', props: { name: 'bell' } })} />);
    expect(container.firstElementChild).toHaveAttribute('aria-hidden', 'true');
  });
});
