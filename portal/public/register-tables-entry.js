import {hydrateRegisterTables} from './register-tables.js?v=a01a7cb1ca';
// Person and party pages are hydrated by their existing application renderers.
if (/^\/(?:instruments|audit)\/?$/.test(location.pathname)) hydrateRegisterTables();
