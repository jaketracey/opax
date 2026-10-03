const { scanBoundary } = require('./transport-policy');
module.exports = {
  meta: { type: 'problem', schema: [], messages: { boundary: '{{reason}}' } },
  create(context) {
    return {
      'Program:exit'() {
        for (const issue of scanBoundary(
          context.filename,
          context.sourceCode.text,
          context.cwd,
        ))
          context.report({
            loc: {
              start: context.sourceCode.getLocFromIndex(issue.start),
              end: context.sourceCode.getLocFromIndex(issue.end),
            },
            messageId: 'boundary',
            data: { reason: issue.reason },
          });
      },
    };
  },
};
