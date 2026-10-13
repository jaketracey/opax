// Web projection: the as-made registration date, never the commencement or version date.
import {readFile, writeFile} from 'node:fs/promises';
import {unpack} from '../public/instruments.js';
const root = new URL('../public/instruments/',import.meta.url);
const read = async file=>JSON.parse(await readFile(new URL(file,root),'utf8'));
const manifest = await read('manifest.json'), registered = {};
for (const chunk of manifest.chunks) {
  for (const value of (await read(chunk.path.replace('/instruments/',''))).records) {
    const {source} = unpack(value,manifest.schemas,manifest.strings);
    registered[source.id] = source.asMadeRegisteredAt?.slice(0,10) || null;
  }
}
await writeFile(new URL('registered.json',root),JSON.stringify(registered)+'\n');
console.log(`Registered dates: ${Object.keys(registered).length} instruments`);
