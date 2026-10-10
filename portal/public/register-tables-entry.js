import {hydrateRegisterTables} from './register-tables.js?v=861e275caf';
// Person and party pages are hydrated by their existing application renderers.
if (/^\/(?:instruments|audit)\/?$/.test(location.pathname)) hydrateRegisterTables();
