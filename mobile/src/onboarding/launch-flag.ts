// Metro substitutes the production stub before this module is traversed, so
// the e2e launch argument and its reader never reach release JS.
export { e2eTourRequested } from './launch-flag.e2e';
