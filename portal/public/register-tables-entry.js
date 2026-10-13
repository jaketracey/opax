import {hydrateRegisterTables} from './register-tables.js?v=58ad18bbee';
// Person and party pages are hydrated by their existing application renderers.
if (/^\/(?:instruments|audit|register\/vic-gifts)\/?$/.test(location.pathname)) hydrateRegisterTables();
