// Expo Router includes development/SSR URL bases in native bundles. Production
// has no Metro/RSC server. Use a reserved, non-resolving base for those dormant
// helpers, so a release artifact contains no loopback origin or fallback.
module.exports = function removeDevelopmentOrigins() {
  return {
    visitor: {
      StringLiteral(path) {
        const value = path.node.value;
        if (/^https?:\/\/(?:localhost|127\.0\.0\.1)(?::\d+)?\/?$/.test(value)) {
          path.node.value = `https://navigation.invalid${value.endsWith('/') ? '/' : ''}`;
        }
      },
    },
  };
};
