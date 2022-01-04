/**
 * @jest-environment jsdom
 */
import * as React from 'react';
import { render, screen } from '@testing-library/react';
import IndexPage, { getServerSideProps } from 'universe/pages/index';

it('renders without crashing', async () => {
  expect.hasAssertions();

  const serverSideProps = (await getServerSideProps()).props;

  render(<IndexPage {...serverSideProps} />);
  expect(screen.getByText('no')).toBeInTheDocument();

  render(<IndexPage {...{ ...serverSideProps, isInProduction: true }} />);
  expect(screen.getByText('yes')).toBeInTheDocument();
});
