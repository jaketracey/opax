import { screen } from './screen';
import { headerItems, pageItems } from '../chrome';
import { copyRecordLink, shareRecord } from '../share';
import { openOnWeb } from '../external';

export function moneyMapScreens() {
  const target = { path: '/money', title: 'Money map' };
  return [
    screen(
      'money',
      'Money map',
      headerItems(
        pageItems({
          name: target.title,
          share: () => {
            void shareRecord(target);
          },
          menu: [
            {
              title: 'Copy link',
              symbol: 'link',
              onPress: () => {
                void copyRecordLink(target.path);
              },
            },
            {
              title: 'Open on opax.com.au',
              symbol: 'safari',
              onPress: () => {
                void openOnWeb(target.path, target.title, {
                  preferNative: false,
                });
              },
            },
          ],
        }),
      ),
    ),
    screen('money-node', 'Money record', { headerShown: false }),
  ];
}
