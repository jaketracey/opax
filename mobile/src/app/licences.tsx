import { RouteOptions } from '../navigation/preview';
import { SourcesScreen } from '../features/sources/SourcesScreen';
import { closeSheetItem, headerItems } from '../navigation/chrome';

export default function LicencesSheet() {
  return (
    <>
      <RouteOptions
        options={{
          title: 'Sources and licences',
          presentation: 'modal',
          ...headerItems(() => [closeSheetItem()]),
        }}
      />
      <SourcesScreen />
    </>
  );
}
