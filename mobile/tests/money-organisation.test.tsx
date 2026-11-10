import { act } from 'react';
import TestRenderer from 'react-test-renderer';
import { useAgencySupplier } from '../src/features/money/organisation';
import { money } from '../src/features/money-public/runtime';

jest.mock('../src/api/runtime', () => ({ apiClient: { get: jest.fn() } }));
jest.mock('../src/features/money-public/runtime', () => ({
  money: { agency: jest.fn() },
}));

test('a supplier’s contracts join on the published supplier ID across changed and duplicate names', async () => {
  jest.mocked(money.agency).mockResolvedValue({
    stale: false,
    savedAt: 100,
    asOf: null,
    data: {
      profile: {
        id: 'fixture-agency',
        name: 'Fixture agency',
        suppliers: [
          {
            id: 'fixture-supplier-a',
            name: 'Fixture Services Pty Ltd',
            organisation: true,
            total: 100,
            count: 1,
          },
        ],
        contracts: [
          {
            id: 'fixture-contract-a',
            supplierId: 'fixture-supplier-a',
            supplier: 'Fixture Services (Former Name) Pty Ltd',
            title: 'Fixture services',
            value: 100,
            start: '2025-01-01',
            end: '',
            published: '2025-01-02',
          },
          {
            id: 'fixture-contract-b',
            supplierId: 'fixture-supplier-b',
            supplier: 'Fixture Services Pty Ltd',
            title: 'Other fixture services',
            value: 900,
            start: '2025-01-01',
            end: '',
            published: '2025-01-02',
          },
        ],
      },
    },
  } as never);
  let loaded!: ReturnType<typeof useAgencySupplier>;
  function Probe() {
    loaded = useAgencySupplier('fixture-supplier-a', 'fixture-agency');
    return null;
  }
  await act(async () => {
    TestRenderer.create(<Probe />);
  });
  expect(loaded.found?.contracts.map((c) => c.id)).toEqual([
    'fixture-contract-a',
  ]);
});
