import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Northbridge's own site records: what its staff verified at the sites it runs, kept in Northbridge's systems, not the
 * sponsor's. The agent answers the sponsor's queries from these. Here, a small file of invented examples.
 */
export interface SiteRecord {
  /** The sponsor's data record the note is about, such as DR-005. */
  dataRecord: string;
  /** What Northbridge's monitor found against the source document. */
  finding: string;
  /** The source document checked. */
  source: string;
  /** When it was checked. */
  checkedOn: string;
}

const here = dirname(fileURLToPath(import.meta.url));

export function loadSiteRecords(file = join(here, 'site-records.json')): SiteRecord[] {
  return JSON.parse(readFileSync(file, 'utf8')) as SiteRecord[];
}

export function siteRecordFor(records: SiteRecord[], dataRecord: string): SiteRecord | undefined {
  return records.find((r) => r.dataRecord.toLowerCase() === dataRecord.trim().toLowerCase());
}
