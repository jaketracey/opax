import {hydrateRegisterTables} from './register-tables.js?v=fbb4ee58ad';
// Person and party pages are hydrated by their existing application renderers.
if (/^\/(?:instruments|audit)\/?$/.test(location.pathname)) hydrateRegisterTables();
