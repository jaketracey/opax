import { ScreenColumn } from '../../../design/adaptive';
import YourMP from '../../../features/YourMP';

// Your MP reads as one page: on iPad regular width it keeps the readable
// column (about 700pt) rather than the wide spread its screen asks for, so
// no line or row runs a landscape screen's width. Compact width is unchanged.
export default function YourMPRoute() {
  return (
    <ScreenColumn column="readable">
      <YourMP />
    </ScreenColumn>
  );
}
