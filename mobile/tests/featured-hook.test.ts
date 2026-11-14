import { featuredHook } from '../src/features/today/featured-hook';

describe('featuredHook', () => {
  it('reads an MP with place, state and count', () => {
    expect(
      featuredHook({
        chamber: 'representatives',
        electorate: 'Mitchell',
        state: 'NSW',
        speeches: 768,
      }),
    ).toBe('MP for Mitchell, in New South Wales. 768 speeches to read.');
  });

  it('reads a senator by state', () => {
    expect(
      featuredHook({
        chamber: 'senate',
        electorate: 'Victoria',
        state: 'VIC',
        speeches: 331,
      }),
    ).toBe('Senator for Victoria. 331 speeches to read.');
  });

  it('falls back to the electorate field for a senator without a state', () => {
    expect(featuredHook({ chamber: 'senate', electorate: 'Tasmania' })).toBe(
      'Senator for Tasmania.',
    );
    expect(featuredHook({ chamber: 'senate' })).toBe('Senator.');
  });

  it('drops each missing part', () => {
    expect(
      featuredHook({ chamber: 'representatives', electorate: 'Corio' }),
    ).toBe('MP for Corio.');
    expect(
      featuredHook({
        chamber: 'representatives',
        electorate: 'Corio',
        state: null,
        speeches: 0,
      }),
    ).toBe('MP for Corio.');
    expect(
      featuredHook({ chamber: 'representatives', state: 'qld', speeches: 5 }),
    ).toBe('MP in Queensland. 5 speeches to read.');
    expect(
      featuredHook({
        chamber: 'representatives',
        electorate: ' ',
        speeches: 12,
      }),
    ).toBe('12 speeches to read.');
    expect(featuredHook({ chamber: 'representatives' })).toBe('');
  });

  it('uses the singular and groups thousands', () => {
    expect(
      featuredHook({
        chamber: 'representatives',
        electorate: 'X',
        speeches: 1,
      }),
    ).toBe('MP for X, 1 speech to read.'.replace(', 1', '. 1'));
    expect(
      featuredHook({
        chamber: 'representatives',
        electorate: 'X',
        speeches: 5408,
      }),
    ).toBe('MP for X. 5,408 speeches to read.');
  });

  it('keeps a long electorate name and unknown state text whole', () => {
    expect(
      featuredHook({
        chamber: 'representatives',
        electorate: 'Kingsford Smith and the Eastern Suburbs of Sydney',
        state: 'NT',
        speeches: 20,
      }),
    ).toBe(
      'MP for Kingsford Smith and the Eastern Suburbs of Sydney, in the Northern Territory. 20 speeches to read.',
    );
    expect(
      featuredHook({
        chamber: 'representatives',
        electorate: 'Y',
        state: 'Norfolk',
      }),
    ).toBe('MP for Y, in Norfolk.');
  });
});
