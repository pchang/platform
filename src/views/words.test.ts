import { describe, expect, it } from 'vitest';
import { buildTypeView } from './orientView';
import { counted, inText } from './words';

// Counts name what they count (design system spec 4.3).
describe('Counting objects of one type', () => {
  it('names the count for its type, singular or plural, in running text', () => {
    expect(counted(12, 'Patient', 'Patients')).toBe('12 patients');
    expect(counted(1, 'Safety Case', 'Safety Cases')).toBe('1 safety case');
    expect(counted(0, 'CAPA', 'CAPAs')).toBe('0 CAPAs');
  });

  it('keeps words that start in capitals, such as CAPA, as they are', () => {
    expect(inText('CAPA Plans')).toBe('CAPA plans');
  });

  it('heads a type list with its count named for the type, never "objects"', () => {
    const patient = (id: string) => ({ iri: `urn:${id}`, identifier: id, type: 'urn:Patient', typeLabel: 'Patient', title: id, pluralLabel: 'Patients', state: {} });
    const json = (objects: ReturnType<typeof patient>[]) => JSON.stringify(buildTypeView('Patients', objects));
    expect(json([patient('PT-01'), patient('PT-02')])).toContain('"label":"2 patients."');
    expect(json([patient('PT-01')])).toContain('"label":"1 patient."');
    expect(json([])).toContain('"label":"0 patients."');
    expect(json([patient('PT-01')])).not.toContain('object.');
  });
});
