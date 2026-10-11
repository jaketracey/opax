import {hydrateRegisterTables} from './register-tables.js?v=1f171de1ae';
// Person and party pages are hydrated by their existing application renderers.
if (/^\/(?:instruments|audit)\/?$/.test(location.pathname)) hydrateRegisterTables();
