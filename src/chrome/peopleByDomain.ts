import { NS } from '../ontology/ontology';
import type { Person } from '../data/client';

/**
 * The people to act as, grouped by the work domain each role is mainly in (design system spec 4.1, Profile): domains in
 * alphabetical order, the platform's own last, and people by name within each.
 */
export function peopleByDomain(people: Person[]): { domain: string; label: string; entries: { person: string; name: string; role: string; roleLabel: string }[] }[] {
  const groups = new Map<string, { domain: string; label: string; entries: { person: string; name: string; role: string; roleLabel: string }[] }>();
  for (const p of people) {
    for (const r of p.roles) {
      const domain = r.domain ?? '';
      const group = groups.get(domain) ?? { domain, label: r.domainLabel ?? 'Other', entries: [] };
      group.entries.push({ person: p.person, name: p.name, role: r.role, roleLabel: r.label });
      groups.set(domain, group);
    }
  }
  const platformOwn = (d: string) => (d.startsWith(NS.p) ? 1 : d ? 0 : 2);
  return [...groups.values()]
    .sort((a, b) => platformOwn(a.domain) - platformOwn(b.domain) || a.label.localeCompare(b.label))
    .map((g) => ({ ...g, entries: g.entries.sort((a, b) => a.name.localeCompare(b.name) || a.roleLabel.localeCompare(b.roleLabel)) }));
}
