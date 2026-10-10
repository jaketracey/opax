import {readFileSync, writeFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';

const portal = new URL('../portal/', import.meta.url);
const require = createRequire(new URL('package.json', portal));
// Use the same JSONC parser as Wrangler, including comments and trailing commas.
const {experimental_readRawConfig} = require('wrangler');
const escapeHtml = value => String(value).replace(/[&<>"']/g, c => ({'&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;'}[c]));

export function configuredModels() {
  const {rawConfig} = experimental_readRawConfig({config: fileURLToPath(new URL('wrangler.jsonc', portal))});
  return {vars: rawConfig.vars, models: JSON.parse(readFileSync(new URL('public/corpus.json', portal), 'utf8')).models};
}

export function methodsModels({vars, models}) {
  if (!vars?.ASK_MODEL || !models?.generation) throw Error('Methods requires the Worker generation pin and corpus model identity');
  // One generation identity is shown only while every configured pipeline uses it.
  for (const [pipeline, pin] of Object.entries(vars).filter(([name]) => name.endsWith('_MODEL'))) {
    if (pin !== models.generation) throw Error(`Methods manifest generation disagrees with ${pipeline}; update corpus.json model identity`);
  }
  let generation = `<code>${escapeHtml(vars.ASK_MODEL)}</code>`;
  if (vars.ASK_MODEL === 'openai-compatible') {
    const details = models.generation_details;
    if (![details?.name, details?.provider, details?.preset, details?.model_id].every(value => typeof value === 'string' && value.trim())) {
      throw Error('Methods requires the OpenRouter slot model identity in corpus.json');
    }
    generation = `<code>${escapeHtml(details.name)}</code> via ${escapeHtml(details.provider)} preset <code>${escapeHtml(details.preset)}</code> (${generation})`;
  }
  const embeddings = typeof models.embeddings === 'string' && models.embeddings.trim()
    ? `<code>${escapeHtml(models.embeddings)}</code>`
    : "the knowledge box's embedding model";
  return {generation, embeddings};
}

export function renderMethodsModels(html, config) {
  const models = methodsModels(config);
  for (const [kind, content] of Object.entries(models)) {
    const pattern = new RegExp(`(<span id="methods-${kind}">)[\\s\\S]*?(</span>)`, 'g');
    if ([...html.matchAll(pattern)].length !== 1) throw Error(`Methods ${kind} marker missing or duplicated`);
    html = html.replace(pattern, (_, open, close) => open + content + close);
  }
  return html;
}

export function buildMethods({check = false} = {}) {
  const path = new URL('public/index.html', portal);
  const before = readFileSync(path, 'utf8');
  const after = renderMethodsModels(before, configuredModels());
  if (check && after !== before) throw Error('Methods model names are stale; run npm run build:methods and npm run stamp');
  if (!check && after !== before) writeFileSync(path, after);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) buildMethods({check: process.argv.includes('--check')});
