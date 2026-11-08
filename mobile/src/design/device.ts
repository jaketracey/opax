import { phoneCopy } from './phone-copy';

/** The shared device noun for copy that already says 'this'. */
export function thisDevice(): string {
  return phoneCopy('iPhone');
}
