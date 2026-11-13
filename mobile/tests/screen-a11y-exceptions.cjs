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
];
