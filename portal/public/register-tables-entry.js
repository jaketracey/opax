import {hydrateRegisterTables} from './register-tables.js?v=928cc5c98f';
// Person and party pages are hydrated by their existing application renderers.
if (/^\/(?:instruments|audit)\/?$/.test(location.pathname)) hydrateRegisterTables();
