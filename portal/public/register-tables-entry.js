import {hydrateRegisterTables} from './register-tables.js?v=1926756d1c';
// Person and party pages are hydrated by their existing application renderers.
if (/^\/(?:instruments|audit|register\/vic-gifts)\/?$/.test(location.pathname)) hydrateRegisterTables();
