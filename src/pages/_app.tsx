/* eslint-disable @typescript-eslint/no-unused-vars */

import * as React from 'react';
import Head from 'next/head';

import type { AppProps } from 'next/app';

export default function App({ Component, pageProps }: AppProps) {
  return (
    <React.Fragment>
      <Head>
        <title>No Browser Access!</title>
      </Head>
      <React.StrictMode>
        <Component {...pageProps} />
      </React.StrictMode>
    </React.Fragment>
  );
}
