const { withAppBuildGradle } = require('expo/config-plugins');

// The generated project contains only this loader, never signing credentials.
// Opt in explicitly: ordinary development/e2e builds retain their debug key.
const signing = `
// OPAX upload signing begin
if (System.getenv('OPAX_PLAY_BUILD') == '1') {
    def credentialsFile = new File(System.getenv('OPAX_UPLOAD_KEY_ENV') ?: new File(System.getProperty('user.home'), '.config/opax/android/upload-key.env').path)
    if (!credentialsFile.isFile()) throw new GradleException('OPAX upload credential file is missing')
    def credentials = new Properties()
    credentialsFile.withInputStream { credentials.load(it) }
    def storeSecret = credentials.getProperty('OPAX_UPLOAD_STORE_PASSWORD')
    def keySecret = credentials.getProperty('OPAX_UPLOAD_KEY_PASSWORD')
    if (!storeSecret || !keySecret) throw new GradleException('OPAX upload credentials are incomplete')
    def keyStore = new File(credentialsFile.parentFile, 'opax-upload.p12')
    if (!keyStore.isFile()) throw new GradleException('OPAX upload keystore is missing')
    android.signingConfigs {
        opaxUpload {
            storeFile keyStore
            storeType 'PKCS12'
            storePassword storeSecret
            keyAlias 'opax-upload'
            keyPassword keySecret
        }
    }
    android.buildTypes.release.signingConfig = android.signingConfigs.opaxUpload
}
// OPAX upload signing end
`;

module.exports = function withAndroidUploadSigning(config) {
  return withAppBuildGradle(config, (mod) => {
    mod.modResults.contents = mod.modResults.contents.replace(
      /\n\/\/ OPAX upload signing begin[\s\S]*?\/\/ OPAX upload signing end\n?/g,
      '',
    );
    mod.modResults.contents += signing;
    return mod;
  });
};
module.exports.signing = signing;
