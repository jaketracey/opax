import {
  readExploreChoices,
  saveExploreChoice,
} from '../src/features/explore/repository';

const mockRead = jest.fn();
const mockSave = jest.fn<Promise<void>, [unknown]>(async () => undefined);
jest.mock('../src/storage/two-slot', () => ({
  TwoSlotStore: class {
    read = () => mockRead();
    save = (value: unknown) => mockSave(value);
  },
}));

test('concurrent year and subject choices retain both changes while disk loads', async () => {
  let resolve!: (value: object) => void;
  const pending = new Promise((done) => {
    resolve = done;
  });
  mockRead.mockReturnValue(pending);
  saveExploreChoice({ year: 2020 });
  saveExploreChoice({ subject: 'housing' });
  resolve({ year: 2022, subject: 'health' });
  await pending;
  await new Promise<void>((done) => setImmediate(done));
  expect(await readExploreChoices()).toEqual({
    year: 2020,
    subject: 'housing',
  });
  expect(mockSave).toHaveBeenLastCalledWith({ year: 2020, subject: 'housing' });
  expect(mockRead).toHaveBeenCalledTimes(1);
});
