import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { NotificationView } from '../data/client';
import { usePrincipal } from '../principal/PrincipalProvider';

/**
 * The person's notifications (platform spec 3.4; design system spec 4.1). New ones appear without a reload:
 * the gateway is asked again every few seconds. When a new one arrives, `changes` goes up, so views that show
 * what a run may have changed, such as To do, load again.
 */

interface NotificationsContext {
  notifications: NotificationView[];
  unread: number;
  /** Goes up each time a new notification arrives. */
  changes: number;
  markRead: (notifications?: string[]) => Promise<void>;
  /** Asks the gateway now, such as after starting a run. */
  refresh: () => void;
}

const Context = createContext<NotificationsContext | null>(null);
/** How often the gateway is asked for new notifications. */
export const NOTIFICATIONS_POLL_MS = 2000;

export function NotificationsProvider({ children }: { children: ReactNode }) {
  const { client, principal } = usePrincipal();
  const [notifications, setNotifications] = useState<NotificationView[]>([]);
  const [changes, setChanges] = useState(0);
  const [tick, setTick] = useState(0);
  const known = useRef<Set<string> | undefined>(undefined);

  // A new person starts with their own notifications, without counting them as new.
  useEffect(() => {
    known.current = undefined;
    setNotifications([]);
  }, [principal]);

  useEffect(() => {
    let cancelled = false;
    const load = () =>
      client.notifications(principal).then(
        (list) => {
          if (cancelled) return;
          const ids = new Set(list.map((n) => n.notification));
          if (known.current && [...ids].some((id) => !known.current!.has(id))) setChanges((c) => c + 1);
          known.current = ids;
          setNotifications(list);
        },
        () => undefined,
      );
    void load();
    const timer = setInterval(load, NOTIFICATIONS_POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [client, principal, tick]);

  const markRead = useCallback(
    async (ids?: string[]) => {
      await client.markRead(principal, ids);
      setNotifications(await client.notifications(principal));
    },
    [client, principal],
  );
  const refresh = useCallback(() => setTick((t) => t + 1), []);

  const value = useMemo(
    () => ({ notifications, unread: notifications.filter((n) => !n.read).length, changes, markRead, refresh }),
    [notifications, changes, markRead, refresh],
  );
  return <Context.Provider value={value}>{children}</Context.Provider>;
}

export function useNotifications(): NotificationsContext {
  const value = useContext(Context);
  if (!value) throw new Error('useNotifications must be used inside NotificationsProvider');
  return value;
}
