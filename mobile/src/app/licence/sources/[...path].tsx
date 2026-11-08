import { RoutePlaceholder } from '../../../navigation/RoutePlaceholder';
export default function Placeholder() {
  return (
    <RoutePlaceholder
      route="licence/sources/[...path]"
      title="Sources and licences"
    />
  );
}
