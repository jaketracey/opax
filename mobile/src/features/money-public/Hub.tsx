import { router } from 'expo-router';
import { Button, Screen, Section, Text } from '../../design/primitives';
import { fromWebPath } from '../../navigation/routes';
import { openOnWeb } from '../../navigation/external';
import { MoneyHeader, Title } from './parts';
export default function Hub() {
  return (
    <>
      <MoneyHeader title="Public money" path="/discover" />
      <Screen testID="money-hub">
        <Title id="money-hub-title">Public money</Title>
        <Text wordSafe>
          Read the published grants and Commonwealth contract records.
        </Text>
        <Section title="Grants">
          <Button
            label="Commonwealth grants"
            testID="money-federal"
            onPress={() =>
              router.push({ pathname: '/grants', params: { jur: 'federal' } })
            }
          />
          <Button
            label="Queensland grants"
            testID="money-qld"
            onPress={() =>
              router.push({ pathname: '/grants', params: { jur: 'qld' } })
            }
          />
          <Button
            label="The month’s largest grants"
            testID="money-largest"
            onPress={() => router.push('/largest-grants')}
          />
          <Button
            label="Where community funding goes"
            testID="money-allocation"
            onPress={() => router.push('/grants-allocation')}
          />
        </Section>
        <Section title="Contracts">
          <Button
            label="Discover"
            testID="money-discover"
            onPress={() => router.push('/discover')}
          />
          <Button
            label="Government agencies"
            testID="money-agencies"
            onPress={() => router.push('/agencies')}
          />
        </Section>
        <Section title="Programs & places">
          <Button
            label="Programs & places"
            testID="money-connections"
            onPress={() => router.push('/connections')}
          />
        </Section>
        <Section title="Money map">
          <Button
            label="3D money map"
            onPress={() => {
              const route = fromWebPath('/money');
              if (route) router.push(route);
              else openOnWeb('/money', 'Money map');
            }}
          />
        </Section>
      </Screen>
    </>
  );
}
