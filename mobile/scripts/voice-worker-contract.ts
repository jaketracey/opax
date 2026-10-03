// Pure extraction/evaluation only: the Worker is never imported or given I/O.
import { createHash } from 'node:crypto';
import { stripTypeScriptTypes } from 'node:module';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import statusFixture from '../modules/opax-voice/ios/OpaxVoiceCore/Tests/OpaxVoiceCoreTests/Fixtures/worker-status.json';
import pin from './voice-worker-contract.json';
function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value !== null && typeof value === 'object')
    return Object.fromEntries(
      Object.entries(value)
        .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
        .map(([key, child]) => [key, canonical(child)]),
    );
  return value;
}
const shapeHash = (value: unknown) => hash(JSON.stringify(canonical(value)));
const hash = (source: string) =>
  createHash('sha256').update(source).digest('hex');
function parse(source: string) {
  return ts.createSourceFile(
    'voice.ts',
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  );
}
function namedFunction(file: ts.SourceFile, name: string, component: string) {
  const nodes = file.statements.filter(
    (node) => ts.isFunctionDeclaration(node) && node.name?.text === name,
  );
  if (nodes.length !== 1)
    throw new Error(
      `Voice fixture drift: ${component} extraction changed; review the contract pin`,
    );
  return nodes[0]!.getText(file);
}
export function workerMessageFilter(source: string) {
  return namedFunction(parse(source), 'voiceClientEvent', 'message filter');
}
function declaration(file: ts.SourceFile, name: string) {
  const nodes = file.statements.flatMap((node) =>
    ts.isVariableStatement(node)
      ? node.declarationList.declarations.filter(
          (value) => ts.isIdentifier(value.name) && value.name.text === name,
        )
      : [],
  );
  if (nodes.length !== 1)
    throw new Error(
      'Voice fixture drift: status response shapes declaration changed; review the contract pin',
    );
  return `const ${nodes[0]!.getText(file)}`;
}
export async function workerContract(source: string) {
  const file = parse(source);
  const filter = namedFunction(file, 'voiceClientEvent', 'message filter');
  const status = namedFunction(file, 'voiceStatus', 'status response shapes');
  const allowance = declaration(file, 'VOICE_ALLOWANCE_SECONDS');
  const configured = declaration(file, 'configured');
  const responses: string[] = [];
  function visit(node: ts.Node) {
    if (
      ts.isReturnStatement(node) &&
      node.expression &&
      ts.isCallExpression(node.expression) &&
      ts.isIdentifier(node.expression.expression) &&
      node.expression.expression.text === 'json'
    ) {
      const value = node.expression.arguments[0];
      if (
        value &&
        ts.isObjectLiteralExpression(value) &&
        value.properties.some(
          (property) =>
            ts.isPropertyAssignment(property) &&
            (ts.isIdentifier(property.name) ||
              ts.isStringLiteral(property.name)) &&
            property.name.text === 'session_id',
        )
      )
        responses.push(node.getText(file));
    }
    ts.forEachChild(node, visit);
  }
  // Only the start branch contributes its success response. Other Worker
  // endpoints/functions may independently return a session_id.
  const route = file.statements.find(
    (node) =>
      ts.isFunctionDeclaration(node) && node.name?.text === 'voiceRoute',
  );
  const starts: ts.Statement[] = [];
  function startCondition(expression: ts.Expression): boolean {
    if (ts.isParenthesizedExpression(expression))
      return startCondition(expression.expression);
    if (!ts.isBinaryExpression(expression)) return false;
    if (expression.operatorToken.kind === ts.SyntaxKind.AmpersandAmpersandToken)
      return (
        startCondition(expression.left) || startCondition(expression.right)
      );
    return (
      expression.operatorToken.kind === ts.SyntaxKind.EqualsEqualsEqualsToken &&
      ts.isIdentifier(expression.left) &&
      expression.left.text === 'path' &&
      ts.isStringLiteral(expression.right) &&
      expression.right.text === 'start'
    );
  }
  function findStart(node: ts.Node) {
    if (ts.isIfStatement(node) && startCondition(node.expression))
      starts.push(node.thenStatement);
    ts.forEachChild(node, findStart);
  }
  if (route) findStart(route);
  if (starts.length !== 1)
    throw new Error(
      'Voice fixture drift: start response route extraction changed; review the contract pin',
    );
  visit(starts[0]!);
  if (responses.length !== 1)
    throw new Error(
      'Voice fixture drift: start response shape extraction changed; review the contract pin',
    );
  const start = responses[0]!;
  let startShape: unknown;
  try {
    startShape = runInNewContext(
      stripTypeScriptTypes(`(() => {${start}})()`),
      {
        session: {
          id: '11111111-1111-4111-8111-111111111111',
          reserved_seconds: 600,
          expires_at: 1700000060,
        },
        url: { href: 'wss://opax.invalid/api/voice/connect' },
        json: (body: unknown, status: number) => ({ body, status }),
      },
      { timeout: 1000 },
    );
  } catch {
    throw new Error(
      'Voice fixture drift: start response shape evaluation changed; review the contract pin',
    );
  }

  const timestamp = 1700000000;
  const evaluate = runInNewContext(
    `${stripTypeScriptTypes(`${allowance}\n${configured}\n${status}`)}; voiceStatus`,
    { now: () => timestamp },
    { timeout: 1000 },
  );
  const shapes: Record<string, unknown> = {};
  try {
    for (const [name, spec] of Object.entries({
      signedOut: { member: null },
      disabledSignedOut: { member: null, disabled: true },
      allowance: { member: 'fixture', used: 120 },
      exhausted: { member: 'fixture', used: 600 },
      unlimited: { member: 'fixture', unlimited: true },
      openSession: { member: 'fixture', used: 600, active: true },
      budgetClosed: { member: 'fixture', used: 120 },
    } as Record<
      string,
      {
        member: string | null;
        used?: number;
        unlimited?: boolean;
        disabled?: boolean;
        active?: boolean;
      }
    >)) {
      shapes[name] = await evaluate(
        {
          VOICE_ENABLED: spec.disabled ? 'false' : 'true',
          VOICE_AGENT_ID: 'fixture',
          ELEVENLABS_API_KEY: 'synthetic-not-a-key',
          VOICE_TOOL_SECRET: 'synthetic-not-a-secret'.repeat(2),
          VOICE_MONTHLY_SECONDS: '0',
          COMMUNITY_DB: {
            prepare(sql: string) {
              return {
                bind() {
                  return this;
                },
                async first() {
                  if (sql.includes('voice_access'))
                    return { unlimited: spec.unlimited ? 1 : 0 };
                  if (sql.includes('COALESCE(SUM'))
                    return { seconds: spec.used ?? 0 };
                  if (sql.includes('SELECT * FROM voice_sessions'))
                    return spec.active
                      ? {
                          id: '11111111-1111-4111-8111-111111111111',
                          state: 'reserved',
                          reserved_seconds: 600,
                          started_at: null,
                          expires_at: timestamp + 60,
                        }
                      : null;
                  throw new Error('Unexpected status SQL');
                },
              };
            },
          },
        },
        spec.member,
      );
    }
  } catch {
    throw new Error(
      'Voice fixture drift: status response shapes evaluation changed; review the contract pin',
    );
  }
  return {
    messageFilter: hash(
      stripTypeScriptTypes(filter).replace(/\s+/g, ' ').trim(),
    ),
    statusResponseShapes: shapeHash(shapes),
    startResponseShape: shapeHash(startShape),
  };
}
export async function assertWorkerContract(source: string) {
  const { budgetClosedFutureW8: _future, ...shapes } = statusFixture.shapes;
  if (shapeHash(shapes) !== pin.statusResponseShapes)
    throw new Error(
      'Voice fixture drift: stored statusResponseShapes changed; review the response fixtures and contract pin',
    );
  const actual = await workerContract(source);
  for (const key of Object.keys(actual) as (keyof typeof actual)[]) {
    if (actual[key] !== pin[key])
      throw new Error(
        `Voice fixture drift: ${key} changed; review and regenerate the contract pin and affected response fixtures`,
      );
  }
}
