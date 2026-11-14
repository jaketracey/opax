const ReactNativeEnvironment = require('@react-native/jest-preset/jest/react-native-env');

// This runs outside Jest's copied process.env, where Node applies TZ changes
// to Date. Keep the preset's React Native export conditions and restore the
// worker's zone before another suite uses it.
module.exports = class SydneyEnvironment extends ReactNativeEnvironment {
  constructor(config, context) {
    const previousZone = process.env.TZ;
    process.env.TZ = 'Australia/Sydney';
    super(config, context);
    this.previousZone = previousZone;
  }

  async teardown() {
    try {
      await super.teardown();
    } finally {
      if (this.previousZone === undefined) delete process.env.TZ;
      else process.env.TZ = this.previousZone;
    }
  }
};
