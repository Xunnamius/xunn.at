/**
 * @jest-environment jsdom
 */
import * as React from 'react';
import { render, screen } from '@testing-library/react';
import App from 'universe/pages/_app';
import { AppProps } from 'next/app';

it('renders without crashing', async () => {
  expect.hasAssertions();

  render(
    <App
      {...({ Component: () => <div>Hello, world!</div> } as unknown as AppProps)}
    />
  );

  expect(screen.getByText('Hello, world!')).toBeInTheDocument();
});
