import { useEffect, useState } from 'react';
import type { GlanceList } from '../data/client';
import { usePrincipal } from '../principal/PrincipalProvider';

/**
 * The initiatives the person may read, and whether their role oversees them, so it opens on At a glance instead of
 * To do (platform spec 3.3, Altitude). Undefined until the gateway answers.
 */
export function useGlanceList(): GlanceList | undefined {
  const { client, principal } = usePrincipal();
  const [list, setList] = useState<{ for: unknown; list: GlanceList }>();
  useEffect(() => {
    let cancelled = false;
    client.glanceList(principal).then((l) => !cancelled && setList({ for: principal, list: l }));
    return () => {
      cancelled = true;
    };
  }, [client, principal]);
  return list?.for === principal ? list.list : undefined;
}
