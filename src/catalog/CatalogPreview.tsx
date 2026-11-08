import { useMemo } from 'react';
import { ViewRenderer } from '../renderer/Renderer';
import { buildCatalogView } from './catalogView';

export function CatalogPreview() {
  const view = useMemo(buildCatalogView, []);
  return <ViewRenderer view={view} />;
}
