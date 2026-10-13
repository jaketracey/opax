import {hydrateRegisterTables} from './register-tables.js?v=be2cd62ed4';
// Person and party pages are hydrated by their existing application renderers.
if (/^\/(?:instruments|audit)\/?$/.test(location.pathname)) hydrateRegisterTables();
