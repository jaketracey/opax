import {hydrateRegisterTables} from './register-tables.js?v=f2e8638ef8';
// Person and party pages are hydrated by their existing application renderers.
if (/^\/(?:instruments|audit)\/?$/.test(location.pathname)) hydrateRegisterTables();
