// Design decision outstanding: the divider sits in a one-point layout slot.
// Allocating a wider pan region changes how the adjacent panes receive taps;
// hitSlop cannot extend beyond that parent. Keep the exception precise.
module.exports = [
  {
    screens: [
      'src/features/Search.tsx',
      'src/features/bills/BillsList.tsx',
      'src/features/directories/DirectoryScreen.tsx',
    ],
    rule: 'target-size',
    element: 'split-divider',
    detail: 'width 17 + hitSlop 0 < 44 on ios',
    reason:
      'Choose a 44-point divider interaction region without taking taps from adjacent panes.',
  },
  ...['ios', 'android'].map((platform) => ({
    screens: ['src/features/money/MoneyScreen.tsx'],
    rule: 'target-size',
    element: 'money-map-handle',
    detail: `height 20 + hitSlop 0 < ${platform === 'ios' ? 44 : 48} on ${platform}`,
    reason:
      'The panel clips the handle strip. Reserving a full target moves the content; extending into it takes taps from the title link or Legend. Needs an interaction design change.',
  })),
];
