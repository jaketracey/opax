import { Redirect, useLocalSearchParams } from 'expo-router';
export default function Discover() {
  const params = useLocalSearchParams();
  return <Redirect href={{ pathname: '/leads', params }} />;
}
