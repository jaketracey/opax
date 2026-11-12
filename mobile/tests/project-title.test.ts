import { projectTitle } from '../src/features/money-public/project-title';

test.each([
  [
    'The project will deliver the construction of the Sample Aquatic Centre comprising a pool and rooms.',
    'Sample Aquatic Centre',
  ],
  [
    'The project will deliver construction of the Sample Hall, including access paths.',
    'Sample Hall',
  ],
  [
    'The project will deliver a new community hall; further works follow.',
    'A new community hall',
  ],
  ['Sample sports lighting.', 'Sample sports lighting'],
  [
    'The project will deliver new sports lighting. The work includes cabling.',
    'New sports lighting',
  ],
])('shortens the purpose to a project title: %s', (purpose, title) => {
  expect(projectTitle(purpose)).toBe(title);
});
