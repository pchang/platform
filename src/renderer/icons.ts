import type { ComponentType, SVGProps } from 'react';
import BellIcon from '@patternfly/react-icons/dist/esm/icons/bell-icon';
import CheckCircleIcon from '@patternfly/react-icons/dist/esm/icons/check-circle-icon';
import CogIcon from '@patternfly/react-icons/dist/esm/icons/cog-icon';
import ExclamationCircleIcon from '@patternfly/react-icons/dist/esm/icons/exclamation-circle-icon';
import ExclamationTriangleIcon from '@patternfly/react-icons/dist/esm/icons/exclamation-triangle-icon';
import InfoCircleIcon from '@patternfly/react-icons/dist/esm/icons/info-circle-icon';
import ListIcon from '@patternfly/react-icons/dist/esm/icons/list-icon';
import MinusIcon from '@patternfly/react-icons/dist/esm/icons/minus-icon';
import OutlinedCheckSquareIcon from '@patternfly/react-icons/dist/esm/icons/outlined-check-square-icon';
import ThLargeIcon from '@patternfly/react-icons/dist/esm/icons/th-large-icon';
import TimesIcon from '@patternfly/react-icons/dist/esm/icons/times-icon';
import UserIcon from '@patternfly/react-icons/dist/esm/icons/user-icon';

/** Icons the catalog allows (Icon's `name` enum in components.json). A test keeps the two in step. */
export const icons: Record<string, ComponentType<SVGProps<SVGElement>>> = {
  bell: BellIcon,
  'check-circle': CheckCircleIcon,
  cog: CogIcon,
  'exclamation-circle': ExclamationCircleIcon,
  'exclamation-triangle': ExclamationTriangleIcon,
  'info-circle': InfoCircleIcon,
  list: ListIcon,
  minus: MinusIcon,
  'outlined-check-square': OutlinedCheckSquareIcon,
  'th-large': ThLargeIcon,
  times: TimesIcon,
  user: UserIcon,
};
