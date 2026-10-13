// Compile fixture-only private modules in memory. ASSETS never gets a prefilter.
import {identityHashes as releaseHashes} from '../../src/table-identity-prefilter.generated.mjs';
export function identityBundlePlugin({prefilter,binding,fingerprint,identityHashes=releaseHashes}) {
  return {name:'fixture-private-identity-bundle',setup(build) {
    build.onResolve({filter:/table-identity-prefilter\.generated\.mjs$/},()=>({path:'prefilter',namespace:'private-identity-fixture'}));
    build.onResolve({filter:/table-registry-fingerprint\.json$/},()=>({path:'fingerprint',namespace:'private-identity-fixture'}));
    build.onLoad({filter:/.*/,namespace:'private-identity-fixture'},({path})=>({loader:'js',contents:path==='fingerprint'
      ? 'export default '+JSON.stringify({fingerprint})+';'
      : 'export const prefilter='+JSON.stringify(prefilter)+';export const binding='+JSON.stringify(binding)+';export const identityHashes='+JSON.stringify(identityHashes)+';'}));
  }};
}
