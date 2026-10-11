import {hydrateRegisterTables} from './register-tables.js?v=3716d35a1d';
// Person and party pages are hydrated by their existing application renderers.
if (/^\/(?:instruments|audit)\/?$/.test(location.pathname)) hydrateRegisterTables();
