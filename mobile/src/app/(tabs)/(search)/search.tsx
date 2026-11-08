import Search from '../../../features/Search';

/**
 * The Search tab root. `opax://search?q=…&scope=…` arrives as route params
 * and runs submitted (SearchScreen reads them); the screen stays mounted
 * across param changes so its scope, filters and pages survive.
 */
export default function SearchRoute() {
  return <Search />;
}
