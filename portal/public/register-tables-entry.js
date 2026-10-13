import {hydrateRegisterTables} from './register-tables.js?v=417aceccbd';
// Person and party pages are hydrated by their existing application renderers.
if (/^\/(?:instruments|audit)\/?$/.test(location.pathname)) hydrateRegisterTables();
