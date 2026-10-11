import {hydrateRegisterTables} from './register-tables.js?v=ca12005c73';
// Person and party pages are hydrated by their existing application renderers.
if (/^\/(?:instruments|audit)\/?$/.test(location.pathname)) hydrateRegisterTables();
