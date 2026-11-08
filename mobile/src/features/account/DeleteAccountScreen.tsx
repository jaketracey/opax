import { Redirect, useLocalSearchParams } from 'expo-router';
import { DeleteCode, DeleteIntro } from './DeleteAccountFlow';

/** `/account/delete`: what happens. The bar title comes from the stack. */
export function DeleteAccountScreen() {
  return <DeleteIntro />;
}

/** `/account/delete/code` ("Deletion code"), with the challenge as a param. */
export function DeleteCodeScreen() {
  const { challenge } = useLocalSearchParams<{ challenge?: string }>();
  const id = Array.isArray(challenge) ? challenge[0] : challenge;
  // Opened cold, with no code sent in this app session: start at step 1.
  if (!id) return <Redirect href="/account/delete" />;
  return <DeleteCode challenge={id} />;
}
