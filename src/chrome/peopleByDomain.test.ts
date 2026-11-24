// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { withSeed } from '../gateway/node';
import { peopleByDomain } from './ProfileMenu';

// Profile's list of people (design system spec 4.1): grouped by the work domain each role is mainly in (platform spec 3.3).
describe('the people to act as', () => {
  it('are grouped by domain, alphabetically, with the platform’s own Structure last, and by name within each', () => {
    const groups = peopleByDomain(withSeed().people());
    expect(groups.map((g) => g.label)).toEqual(['Clinical Development', 'Design and Plan', 'Safety and Regulatory', 'Scientific Innovation', 'Structure']);
    const of = (label: string) => groups.find((g) => g.label === label)!.entries.map((e) => `${e.name}, ${e.roleLabel}`);
    expect(of('Design and Plan')).toContain('Marcus Bell, Clinical Operations Lead');
    expect(of('Structure')).toEqual(['Noor Rahman, Structure Steward']);
    for (const g of groups) expect(g.entries.map((e) => e.name)).toEqual([...g.entries.map((e) => e.name)].sort((a, b) => a.localeCompare(b)));
    // Everyone is listed once for each role they act in.
    expect(groups.flatMap((g) => g.entries)).toHaveLength(withSeed().people().flatMap((p) => p.roles).length);
  });
});
