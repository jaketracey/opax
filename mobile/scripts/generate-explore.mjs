// Regenerate from checked-in public exports only. Never fetch the live Worker.
import { readFileSync, writeFileSync, mkdirSync, copyFileSync } from 'node:fs';
import { Buffer } from 'node:buffer';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { resolve, dirname } from 'node:path';
const mobile = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const publicRoot = resolve(mobile, '../portal/public');
const output = resolve(mobile, 'src/features/explore');
mkdirSync(output, { recursive: true });
const hashes = {};
const read = (path) => {
  const bytes = readFileSync(resolve(publicRoot, path));
  hashes[path] = createHash('sha256').update(bytes).digest('hex');
  return JSON.parse(bytes);
};
const source = readFileSync(resolve(publicRoot, 'quiz.js'), 'utf8');
hashes['quiz.js'] = createHash('sha256').update(source).digest('hex');
const engine = await import(
  'data:text/javascript;base64,' +
    Buffer.from(
      source.slice(0, source.indexOf('async function fetchJson')),
    ).toString('base64')
);
const data = {
  money: read('graph/money.json'),
  corpus: read('corpus.json'),
  parliamentarians: read('parliamentarians.json'),
  reports: {},
  years: {},
};
for (const row of read('reports/index.json').reports)
  data.reports[row.slug] = read(`reports/${row.slug}.json`);
for (const year of Object.keys(read('years/index.json').years))
  data.years[year] = read(`years/${year}.json`);
const rounds = {};
for (const deck of ['mixed', 'money', 'words']) {
  rounds[deck] = Array.from({ length: 16 }, (_, seed) => {
    const questions = engine.buildRound(
      data,
      engine.createRng(seed + 48),
      8,
      deck,
    );
    if (
      questions.length !== 8 ||
      questions.some((q) => !engine.validateQuestion(q))
    )
      throw new Error(`Incomplete ${deck} deck`);
    // The web's old top-N wording predates the public-money additions.
    // Keep its question and scoring; use the current export's exact method.
    for (const question of questions) {
      if (question.explanation.startsWith('The map deliberately shows the '))
        question.explanation = data.money.meta.methodology;
      question.explanation = question.explanation.replace(
        "from the industry's biggest donors",
        'from the donors in the money export',
      );
    }
    return questions;
  });
}
writeFileSync(
  resolve(output, 'quiz-rounds.json'),
  JSON.stringify(
    { generated: data.money.meta.generated, hashes, rounds },
    null,
    2,
  ) + '\n',
);
const pictures = read('years/pictures.json');
const assetRoot = resolve(mobile, 'assets/explore');
mkdirSync(assetRoot, { recursive: true });
const assets = [];
for (const [year, rows] of Object.entries(pictures)) {
  for (const picture of rows) {
    if (
      !picture.file.startsWith(`years/pictures/${year}/`) ||
      picture.file.includes('..')
    )
      throw new Error('Unsafe picture');
    const filename = `${year}-${picture.file.split('/').at(-1)}`;
    copyFileSync(
      resolve(publicRoot, picture.file),
      resolve(assetRoot, filename),
    );
    assets.push(
      `    case ${JSON.stringify(picture.file)}: return <Image source={require('../../../assets/explore/${filename}')} style={style} resizeMode="contain" accessible={false} />;`,
    );
  }
}
writeFileSync(
  resolve(output, 'pictures.json'),
  JSON.stringify(pictures, null, 2) + '\n',
);
writeFileSync(
  resolve(output, 'Picture.tsx'),
  `// Unchanged, bundled web photographs; credits are in Sources and licences.\nimport { Image } from 'react-native';\nexport function Picture({file,ratio}:{file:string;ratio:number}) {\n  const style={width:'100%' as const,height:undefined,aspectRatio:ratio};\n  switch(file) {\n${assets.join('\n')}\n    default: return null;\n  }\n}\n`,
);
console.log(
  `Generated 48 eight-question rounds and ${assets.length} unchanged photographs from local exports.`,
);
