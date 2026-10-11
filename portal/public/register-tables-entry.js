import {hydrateRegisterTables} from './register-tables.js?v=68883bdacd';
// Person and party pages are hydrated by their existing application renderers.
if (/^\/(?:instruments|audit)\/?$/.test(location.pathname)) hydrateRegisterTables();
