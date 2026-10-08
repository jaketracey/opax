const { withMainActivity } = require('expo/config-plugins');

// RN 0.86 registers its dispatcher callback only on OS/target API 36+.
// Our manifest opts in on API 33–35 too: bridge committed Back to RN there.
// The callback must be disabled during RN's asynchronous default exit, or a
// root Back would re-enter JS forever. API 36 retains RN's own implementation.
const field = `  // OPAX legacy predictive Back bridge
  private var opaxBackCallback: androidx.activity.OnBackPressedCallback? = null
`;
const onCreate = `
    if (Build.VERSION.SDK_INT in 33..35) {
      opaxBackCallback = object : androidx.activity.OnBackPressedCallback(true) {
        override fun handleOnBackPressed() {
          isEnabled = false
          try {
            this@MainActivity.onBackPressed()
          } finally {
            isEnabled = true
          }
        }
      }
      onBackPressedDispatcher.addCallback(this, opaxBackCallback!!)
    }
`;
const defaultBack = `  override fun invokeDefaultOnBackPressed() {
    opaxBackCallback?.isEnabled = false
    try {
      if (Build.VERSION.SDK_INT <= Build.VERSION_CODES.R) {
        if (!moveTaskToBack(false)) super.invokeDefaultOnBackPressed()
      } else {
        super.invokeDefaultOnBackPressed()
      }
    } finally {
      opaxBackCallback?.isEnabled = true
    }
  }`;

module.exports = function withAndroidBack(config) {
  return withMainActivity(config, (mod) => {
    let source = mod.modResults.contents;
    if (source.includes('// OPAX legacy predictive Back bridge')) return mod;
    const activity = 'class MainActivity : ReactActivity() {';
    const create = '    super.onCreate(null)';
    const exit =
      /  override fun invokeDefaultOnBackPressed\(\) \{[\s\S]*?\n  \}/;
    if (
      !source.includes(activity) ||
      !source.includes(create) ||
      !exit.test(source)
    )
      throw new Error(
        'Android Back bridge: review generated MainActivity anchors',
      );
    source = source.replace(activity, `${activity}\n${field}`);
    source = source.replace(create, `${create}${onCreate}`);
    source = source.replace(exit, defaultBack);
    mod.modResults.contents = source;
    return mod;
  });
};
