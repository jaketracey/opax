import { LinkRow, RowList, Screen, Text } from '../../design/primitives';
import { router } from 'expo-router';
import { fromWebPath } from '../../navigation/routes';
import { openOnWeb } from '../../navigation/external';
import { MoneyHeader, Title } from './parts';

/**
 * Public money: one title, one line, one list. Each row says where it goes;
 * the figures and their sources are on the screens it opens.
 */
export default function Hub() {
  return (
    <>
      <MoneyHeader title="Public money" path="/discover" />
      <Screen testID="money-hub">
        <Title id="money-hub-title">Public money</Title>
        <Text wordSafe variant="metadata">
          Published grants and Commonwealth contracts, and where they meet the
          donation returns.
        </Text>
        <RowList>
          <LinkRow
            title="Commonwealth grants"
            detail="By program and by electorate"
            testID="money-federal"
            onPress={() =>
              router.push({ pathname: '/grants', params: { jur: 'federal' } })
            }
          />
          <LinkRow
            title="Queensland grants"
            detail="By program and by electorate"
            testID="money-qld"
            onPress={() =>
              router.push({ pathname: '/grants', params: { jur: 'qld' } })
            }
          />
          <LinkRow
            title="The month’s largest grants"
            testID="money-largest"
            onPress={() => router.push('/largest-grants')}
          />
          <LinkRow
            title="Where community funding goes"
            testID="money-allocation"
            onPress={() => router.push('/grants-allocation')}
          />
          <LinkRow
            title="Government agencies"
            detail="Who awards Commonwealth contracts"
            testID="money-agencies"
            onPress={() => router.push('/agencies')}
          />
          <LinkRow
            title="Discover"
            detail="Contracts by agency, party funding, companies in both"
            testID="money-discover"
            onPress={() => router.push('/discover')}
          />
          <LinkRow
            title="Programs & places"
            testID="money-connections"
            onPress={() => router.push('/connections')}
          />
          <LinkRow
            title="Money map"
            detail="Donations and public money in 3D"
            testID="money-map"
            onPress={() => {
              const route = fromWebPath('/money');
              if (route) router.push(route);
              else openOnWeb('/money', 'Money map');
            }}
          />
        </RowList>
      </Screen>
    </>
  );
}
