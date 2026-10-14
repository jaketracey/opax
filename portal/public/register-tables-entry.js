import {hydrateRegisterTables} from './register-tables.js?v=ef1565e7c4';
// Person and party pages are hydrated by their existing application renderers.
if (/^\/(?:instruments|audit|register\/vic-gifts)\/?$/.test(location.pathname)) hydrateRegisterTables();
