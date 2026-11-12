import { useNotifications } from '../notifications/NotificationsProvider';
import { ComposeDialog } from '../views/ComposeDialog';
import { PAGE_ARCHETYPES, successNotice } from '../views/composeView';
import { useProcesses } from './ProcessProvider';

/** Whether the process in front takes the place of the view, as page patterns do (design system spec 5.1). */
export function useFrontIsPage(): boolean {
  const { front } = useProcesses();
  return Boolean(front && PAGE_ARCHETYPES.has(front.archetype));
}

/**
 * The process in front, through its archetype's pattern. Keyed by process, so restoring one starts its pattern afresh
 * from what it kept, and setting it aside unmounts it.
 */
export function ProcessHost() {
  const { front, finish, close, minimize, update } = useProcesses();
  const { refresh: refreshNotifications } = useNotifications();
  if (!front) return null;
  return (
    <ComposeDialog
      key={front.id}
      object={front.object}
      method={front.method}
      process={front}
      onChange={(snapshot) => update(front.id, snapshot)}
      onMinimize={minimize}
      onCancel={(notice) => close(front.id, notice)}
      onDone={(composition, result) => {
        finish(front.id, successNotice(composition, result));
        if (result.run) refreshNotifications();
      }}
    />
  );
}
