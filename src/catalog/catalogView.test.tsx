import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { catalog } from '../design-system/catalog';
import { validateView } from '../design-system/validateView';
import { buildCatalogView } from './catalogView';
import { CatalogPreview } from './CatalogPreview';

describe('catalog preview', () => {
  it('is a valid view spec', () => {
    expect(validateView(buildCatalogView()).errors).toEqual([]);
  });

  it('shows a card for every component and token group', () => {
    render(<CatalogPreview />);
    for (const { id } of catalog.components) {
      expect(screen.getByRole('heading', { level: 3, name: id })).toBeInTheDocument();
    }
    for (const { id } of catalog.files.tokens.groups) {
      expect(screen.getByRole('heading', { level: 3, name: new RegExp(`^${id}$`, 'i') })).toBeInTheDocument();
    }
  });
});
