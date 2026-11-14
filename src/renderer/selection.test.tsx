import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { ViewNode, ViewSpec } from '../design-system/catalog';
import { ViewRenderer, type RenderHost } from './Renderer';

// Choosing objects for a batch action, and a list row's actions (design system spec 4.3), drawn by the renderer.

const view = (root: ViewNode): ViewSpec => ({ pattern: 'card-view', because: 'test', root });
const A = 'urn:object-a';

const card: ViewNode = {
  component: 'Card',
  opens: A,
  selects: A,
  children: [
    { component: 'CardHeader', children: [{ component: 'CardTitle', props: { label: 'Fever and cough', component: 'h2' } }] },
    { component: 'CardBody', children: [{ component: 'Button', props: { label: 'Triage' }, action: { method: 'urn:Triage', target: A } }] },
  ],
};

function selection(selecting: boolean, chosen: string[] = []) {
  return { selecting, selected: new Set(chosen), onSelect: vi.fn<(object: string, chosen: boolean) => void>() };
}

describe('choosing objects', () => {
  it('shows no select control outside select mode, and a click on the card opens it', async () => {
    const host: RenderHost = { selection: selection(false), onOpen: vi.fn() };
    const { container } = render(<ViewRenderer view={view(card)} host={host} />);
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
    await userEvent.click(container.querySelector('.pf-v6-c-card__body')!);
    expect(host.onOpen).toHaveBeenCalledWith(A, expect.any(HTMLElement));
  });

  it('in select mode, shows a round checkbox named for the card, and choosing the card chooses it instead of opening it', async () => {
    const host: RenderHost = { selection: selection(true), onOpen: vi.fn() };
    const { container } = render(<ViewRenderer view={view(card)} host={host} />);
    const box = screen.getByRole('checkbox', { name: 'Select Fever and cough' });
    expect(box).toHaveAttribute('aria-checked', 'false');
    await userEvent.click(container.querySelector('.pf-v6-c-card__body')!);
    expect(host.selection!.onSelect).toHaveBeenCalledWith(A, true);
    expect(host.onOpen).not.toHaveBeenCalled();
    // The card's own buttons still do their own thing.
    await userEvent.click(screen.getByRole('button', { name: 'Triage' }));
    expect(host.selection!.onSelect).toHaveBeenCalledTimes(1);
  });

  it('shows a chosen card checked, with its border, and unchecks it', async () => {
    const host: RenderHost = { selection: selection(true, [A]) };
    const { container } = render(<ViewRenderer view={view(card)} host={host} />);
    const box = screen.getByRole('checkbox', { name: 'Select Fever and cough' });
    expect(box).toHaveAttribute('aria-checked', 'true');
    expect(container.querySelector('.app-card-chosen')).not.toBeNull();
    await userEvent.click(box);
    expect(host.selection!.onSelect).toHaveBeenCalledWith(A, false);
  });
});

describe('a list row', () => {
  const row: ViewNode = {
    component: 'DataList',
    props: { 'aria-label': 'Safety Cases' },
    children: [
      {
        component: 'DataListItem',
        selects: A,
        children: [
          { component: 'DataListCell', props: { isFilled: true }, children: [{ component: 'Content', props: { label: 'SC-004 · Safety Case' } }] },
          {
            component: 'DataListAction',
            props: { 'aria-label': 'Actions for SC-004' },
            children: [
              { component: 'Button', props: { label: 'Triage', variant: 'secondary', size: 'sm' }, action: { method: 'urn:Triage', target: A } },
              { component: 'Dropdown', props: { 'aria-label': 'More actions for SC-004' }, children: [{ component: 'DropdownItem', props: { label: 'Flag duplicate' }, action: { method: 'urn:Flag', target: A } }] },
            ],
          },
        ],
      },
    ],
  };

  it('has a checkbox named for its object, always', async () => {
    const host: RenderHost = { selection: selection(false) };
    render(<ViewRenderer view={view(row)} host={host} />);
    await userEvent.click(screen.getByRole('checkbox', { name: 'Select SC-004 · Safety Case' }));
    expect(host.selection!.onSelect).toHaveBeenCalledWith(A, true);
  });

  it('raises one method and keeps the rest in a … menu that runs them', async () => {
    const host: RenderHost = { selection: selection(false), onAction: vi.fn() };
    render(<ViewRenderer view={view(row)} host={host} />);
    expect(screen.getByRole('button', { name: 'Triage' })).toBeInTheDocument();
    const more = screen.getByRole('button', { name: 'More actions for SC-004' });
    expect(more).toHaveAttribute('aria-expanded', 'false');
    await userEvent.click(more);
    await userEvent.click(within(await screen.findByRole('menu')).getByRole('menuitem', { name: 'Flag duplicate' }));
    expect(host.onAction).toHaveBeenCalledWith({ method: 'urn:Flag', target: A }, expect.anything());
  });
});

describe('the list bar', () => {
  it('switches view with a toggle bound to a field, and runs a batch action on the chosen objects', async () => {
    const onField = vi.fn();
    const onBatch = vi.fn();
    const bar: ViewNode = {
      component: 'Toolbar',
      children: [
        {
          component: 'ToolbarContent',
          children: [
            { component: 'ToolbarItem', children: [{ component: 'Button', props: { label: 'Triage', variant: 'secondary', size: 'sm' }, batch: 'urn:Triage' }] },
            {
              component: 'ToolbarItem',
              children: [
                {
                  component: 'ToggleGroup',
                  props: { 'aria-label': 'Show objects as', isCompact: true },
                  children: [
                    { component: 'ToggleGroupItem', props: { value: 'cards', icon: 'th-large', 'aria-label': 'Cards' }, field: 'listMode' },
                    { component: 'ToggleGroupItem', props: { value: 'list', icon: 'list', 'aria-label': 'List' }, field: 'listMode' },
                  ],
                },
              ],
            },
          ],
        },
      ],
    };
    render(<ViewRenderer view={view(bar)} host={{ values: { listMode: 'cards' }, onField, onBatch }} />);
    expect(screen.getByRole('button', { name: 'Cards' })).toHaveAttribute('aria-pressed', 'true');
    await userEvent.click(screen.getByRole('button', { name: 'List' }));
    expect(onField).toHaveBeenCalledWith('listMode', 'list');
    await userEvent.click(screen.getByRole('button', { name: 'Triage' }));
    expect(onBatch).toHaveBeenCalledWith('urn:Triage');
  });
});
