import {
  Button,
  NotificationDrawer,
  NotificationDrawerBody,
  NotificationDrawerHeader,
  NotificationDrawerList,
  NotificationDrawerListItem,
  NotificationDrawerListItemBody,
  NotificationDrawerListItemHeader,
  Content,
  Flex,
} from '@patternfly/react-core';
import './NotificationsDrawer.css';
import { useNotifications } from '../notifications/NotificationsProvider';

/** When a notification came, in the person's locale: the time today, otherwise the date and time. */
function when(iso: string, now = new Date()): string {
  const at = new Date(iso);
  const sameDay = at.toDateString() === now.toDateString();
  return sameDay
    ? at.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
    : at.toLocaleString(undefined, {
        day: 'numeric',
        month: 'short',
        hour: 'numeric',
        minute: '2-digit',
      });
}

/**
 * The notification drawer (design system spec 4.1): the person's notifications, newest first. Choosing one
 * marks it read; Mark all read clears the count.
 */
export function NotificationsDrawer({ onClose }: { onClose: () => void }) {
  const { notifications, unread, markRead } = useNotifications();
  return (
    // A named region, so its content sits in a landmark like the rest of the page.
    <NotificationDrawer role="region" aria-label="Notifications">
      <NotificationDrawerHeader
        count={unread}
        onClose={onClose}
        closeButtonAriaLabel="Close notifications"
      />
      <NotificationDrawerBody>
        {notifications.length ? (
          <>
            {/* In the body, not the header, so the header fits on one line on a phone. */}
            <Flex
              justifyContent={{ default: 'justifyContentFlexEnd' }}
              className="app-notifications__actions"
            >
              <Button
                variant="link"
                isInline
                isDisabled={!unread}
                onClick={() => void markRead()}
              >
                Mark all read
              </Button>
            </Flex>
            <NotificationDrawerList aria-label="Notifications, newest first">
              {notifications.map((n) => {
                const variant = n.status === 'succeeded' ? 'success' : 'danger';
                return (
                  <NotificationDrawerListItem
                    key={n.notification}
                    variant={variant}
                    isRead={n.read}
                    onClick={() => !n.read && void markRead([n.notification])}
                  >
                    <NotificationDrawerListItemHeader
                      variant={variant}
                      title={n.title}
                      srTitle={`${n.status === 'succeeded' ? 'Success' : 'Failure'} notification${n.read ? '' : ', unread'}:`}
                      headingLevel="h2"
                    />
                    <NotificationDrawerListItemBody
                      timestamp={<time dateTime={n.at}>{when(n.at)}</time>}
                    >
                      {n.objectIdentifier}: {n.message}
                    </NotificationDrawerListItemBody>
                  </NotificationDrawerListItem>
                );
              })}
            </NotificationDrawerList>
          </>
        ) : (
          <Content component="p" className="app-notifications__empty">
            No notifications yet. When something you started in the background
            ends, it appears here.
          </Content>
        )}
      </NotificationDrawerBody>
    </NotificationDrawer>
  );
}
