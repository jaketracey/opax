import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { NavigationContext } from 'expo-router/react-navigation';
import React, { act, useEffect } from 'react';
import TestRenderer from 'react-test-renderer';
import ts from 'typescript';
import {
  androidHeaderBar,
  filtersItem,
  headerItems,
  pageMenu,
  rootHeaderItems,
} from '../src/navigation/chrome';
import { RouteOptions } from '../src/navigation/preview';
import { sharedScreens, tabRootName } from '../src/navigation/stack';

jest.mock('expo-router', () => ({
  useIsPreview: () => false,
  Stack: { Screen: () => null },
  router: { push: jest.fn() },
}));
jest.mock('../src/features/account/store', () => ({
  accountSnapshot: () => ({ status: { signedIn: false } }),
}));

const tabs = ['(today)', '(your-mp)', '(bills)', '(search)', '(ask)'] as const;

test.each(tabs)('%s registers Account before the root mounts', (segment) => {
  const entry = sharedScreens(segment, false).find(
    (entry) => entry.props.name === tabRootName(segment),
  )!;
  const options = entry.props.options({ route: { params: {} } });
  expect(options.unstable_headerRightItems()).toContainEqual(
    expect.objectContaining({
      label: 'Account',
      testID: 'header-account',
      identifier: 'header-account',
    }),
  );
});

test.each(tabs)(
  '%s installs dynamic items before passive effects',
  (segment) => {
    const setOptions = jest.fn();
    const options = headerItems(() =>
      rootHeaderItems({ segment, signedIn: false }),
    );
    function Root() {
      useEffect(() => {
        expect(setOptions).toHaveBeenCalledWith(options);
      }, []);
      return <RouteOptions options={options} />;
    }
    let view!: TestRenderer.ReactTestRenderer;
    act(() => {
      view = TestRenderer.create(
        <NavigationContext.Provider value={{ setOptions } as never}>
          <Root />
        </NavigationContext.Provider>,
      );
    });
    act(() => view.unmount());
  },
);

test('root screens and their option installers never register bar items in passive effects', () => {
  const files = [
    'features/Today.tsx',
    'features/YourMP.tsx',
    'features/bills/BillsList.tsx',
    'features/search/SearchScreen.tsx',
    'features/ask/AskScreen.tsx',
    'navigation/preview.tsx',
    'navigation/useRootBarAppearance.ts',
    'design/layout.tsx',
  ];
  for (const file of files) {
    const source = readFileSync(join(__dirname, '../src', file), 'utf8');
    const ast = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true);
    const inspect = (node: ts.Node) => {
      if (
        ts.isCallExpression(node) &&
        /^(React\.)?useEffect$/.test(node.expression.getText(ast))
      ) {
        expect({ file, effect: node.getText(ast) }).toEqual({
          file,
          effect: expect.not.stringMatching(
            /setOptions|headerItems|rootHeaderItems|askHeaderItems|header(Right|Left)|unstable_header(Right|Left)Items/,
          ),
        });
      }
      ts.forEachChild(node, inspect);
    };
    inspect(ast);
  }
});

test('bar item dictionaries carry the exact test IDs without changing spoken labels', () => {
  const items = [
    pageMenu({ name: 'Daily edition', items: [] }),
    filtersItem({ active: true, href: '/filters/bills' }),
    ...rootHeaderItems({ segment: '(today)', signedIn: false }),
  ];
  expect(items.slice(0, 3)).toMatchObject([
    {
      testID: 'header-more',
      identifier: 'header-more',
      accessibilityLabel: 'More for Daily edition',
    },
    {
      testID: 'header-filters',
      identifier: 'header-filters',
      accessibilityLabel: 'Filters, on',
    },
    {
      testID: 'header-account',
      identifier: 'header-account',
      accessibilityLabel: 'Account',
    },
  ]);
  expect(headerItems(() => items).unstable_headerRightItems?.()).toEqual(items);
  const android = androidHeaderBar(items);
  expect(
    React.Children.toArray(android.props.children)
      .map(
        (child) =>
          (child as React.ReactElement<{ testID: string }>).props.testID,
      )
      .slice(0, 3),
  ).toEqual(['header-more', 'header-filters', 'header-account']);
});
