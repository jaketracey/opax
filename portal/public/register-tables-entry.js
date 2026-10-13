import {hydrateRegisterTables} from './register-tables.js?v=ec3cfd662b';
// Person and party pages are hydrated by their existing application renderers.
if (/^\/(?:instruments|audit)\/?$/.test(location.pathname)) hydrateRegisterTables();
