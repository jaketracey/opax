const withAndroidPolicy = jest.requireActual('../plugins/withAndroidPolicy');

const activity = `package au.com.opax.app
class MainActivity : ReactActivity() {
  override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(null)
  }
}`;

test('Android retains the new intent before RN emits it, including before JS starts', async () => {
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
    setIntent(intent)
    super.onNewIntent(intent)
  }`);
  expect(result.match(/override fun onNewIntent/g)).toHaveLength(1);
  expect(await apply(result)).toBe(result);
  await expect(apply('unsupported template')).rejects.toThrow(
    'MainActivity class anchor',
  );
});
