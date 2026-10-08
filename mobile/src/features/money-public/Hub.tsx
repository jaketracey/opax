import {
  PadGrid,
  LinkRow,
  RowList,
  Screen,
  Section,
  Text,
} from '../../design/primitives';
import { router } from 'expo-router';
import { fromWebPath } from '../../navigation/routes';
import { openOnWeb } from '../../navigation/external';
import { MoneyHeader, Title } from './parts';
export default function Hub() {
  return (
    <>
      <MoneyHeader title="Public money" path="/discover" />
      <Screen column="wide" testID="money-hub">
        <Title id="money-hub-title">Public money</Title>
        <Text wordSafe>
          Read the published grants and Commonwealth contract records.
        </Text>
        <PadGrid>
          <Section title="Grants" accent="money">
            <RowList>
              <LinkRow
                accent="money"
                title="Commonwealth grants"
                testID="money-federal"
                onPress={() =>
                  router.push({
                    pathname: '/grants',
                    params: { jur: 'federal' },
                  })
                }
              />
              <LinkRow
                accent="money"
                title="Queensland grants"
                testID="money-qld"
                onPress={() =>
                  router.push({ pathname: '/grants', params: { jur: 'qld' } })
                }
              />
              <LinkRow
                accent="money"
                title="The month’s largest grants"
                testID="money-largest"
                onPress={() => router.push('/largest-grants')}
              />
              <LinkRow
                accent="money"
                title="Where community funding goes"
                testID="money-allocation"
                onPress={() => router.push('/grants-allocation')}
              />
            </RowList>
          </Section>
          <Section title="Contracts" accent="money">
            <RowList>
              <LinkRow
                accent="money"
                title="Discover"
                testID="money-discover"
                onPress={() => router.push('/discover')}
              />
              <LinkRow
                accent="money"
                title="Government agencies"
                testID="money-agencies"
                onPress={() => router.push('/agencies')}
              />
            </RowList>
          </Section>
          <Section title="Programs & places" accent="money">
            <LinkRow
              accent="money"
              title="Programs & places"
              testID="money-connections"
              onPress={() => router.push('/connections')}
            />
          </Section>
          <Section title="Money map" accent="money">
            <LinkRow
              accent="money"
              title="3D money map"
              onPress={() => {
                const route = fromWebPath('/money');
                if (route) router.push(route);
                else openOnWeb('/money', 'Money map');
              }}
            />
          </Section>
        </PadGrid>
      </Screen>
    </>
  );
}
