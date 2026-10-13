import {hydrateRegisterTables} from './register-tables.js?v=b1f9ff8eee';
// Person and party pages are hydrated by their existing application renderers.
if (/^\/(?:instruments|audit)\/?$/.test(location.pathname)) hydrateRegisterTables();
