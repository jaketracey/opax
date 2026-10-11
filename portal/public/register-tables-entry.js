import {hydrateRegisterTables} from './register-tables.js?v=586111ec87';
// Person and party pages are hydrated by their existing application renderers.
if (/^\/(?:instruments|audit)\/?$/.test(location.pathname)) hydrateRegisterTables();
