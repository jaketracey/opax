const withAndroidPolicy = jest.requireActual('../plugins/withAndroidPolicy');

const activity = `package au.com.opax.app
class MainActivity : ReactActivity() {
  override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(null)
  }
}`;

test('Android captures and restores delivery identities before RN starts or emits', async () => {
  const ios = { bundleIdentifier: 'au.com.opax.app' };
  const config = withAndroidPolicy({ name: 'OPAX', slug: 'opax', ios });
  expect(config.ios).toBe(ios);
  const apply = async (contents: string) =>
    (
      await config.mods.android.mainActivity({
        ...config,
        modRequest: {},
        modResults: { language: 'kt', contents },
      })
    ).modResults.contents as string;
  const result = await apply(activity);
  expect(result)
    .toContain(`override fun onNewIntent(intent: android.content.Intent) {
    opaxLinks.onNewIntent(intent)
    super.onNewIntent(intent)
  }`);
  expect(result.indexOf('opaxLinks.onCreate(savedInstanceState)')).toBeLessThan(
    result.indexOf('super.onCreate(null)'),
  );
  expect(result).toContain('opaxLinks.onSaveInstanceState(outState)');
  expect(result.match(/override fun onNewIntent/g)).toHaveLength(1);
  expect(await apply(result)).toBe(result);
  const previous = activity.replace(
    'class MainActivity : ReactActivity() {',
    `class MainActivity : ReactActivity() {
  // OPAX retain links received during JS startup
  override fun onNewIntent(intent: android.content.Intent) {
    setIntent(intent)
    super.onNewIntent(intent)
  }
`,
  );
  const migrated = await apply(previous);
  expect(migrated).toContain('opaxLinks.onNewIntent(intent)');
  expect(migrated.match(/override fun onNewIntent/g)).toHaveLength(1);
  expect(await apply(migrated)).toBe(migrated);
  await expect(apply('unsupported template')).rejects.toThrow(
    'MainActivity class anchor',
  );
});
