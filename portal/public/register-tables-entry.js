import {hydrateRegisterTables} from './register-tables.js?v=1b1a3b83d8';
// Person and party pages are hydrated by their existing application renderers.
if (/^\/(?:instruments|audit)\/?$/.test(location.pathname)) hydrateRegisterTables();
