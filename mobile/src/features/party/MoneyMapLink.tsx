import { OpaxWebLink } from '../../design/primitives';
/** Single destination seam for the forthcoming native money-map lane. */
export function MoneyMapLink() {
  return (
    <OpaxWebLink
      label="Open the money map"
      path="/money"
      testID="party-money-map"
    />
  );
}
