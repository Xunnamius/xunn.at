import * as React from 'react';
import { version as pkgVersion } from 'package';
import { getEnv } from 'universe/backend/env';

import { PromiseValue as Awaited } from 'type-fest';

export async function getServerSideProps() {
  const env = getEnv();

  return {
    props: {
      isInProduction: env.NODE_ENV == 'production',
      nodeEnv: env.NODE_ENV,
      nodeVersion: process.version
    }
  };
}

export default function Index({
  isInProduction,
  nodeEnv,
  nodeVersion
}: Awaited<ReturnType<typeof getServerSideProps>>['props']) {
  return (
    <React.Fragment>
      <p>
        Serverless node runtime: <strong>{nodeVersion}</strong> <br />
        Xunn.at runtime: <strong>{`v${pkgVersion}`}</strong>
        <br />
      </p>
      <p>
        Environment: <strong>{nodeEnv}</strong> <br />
        Production mode:{' '}
        <strong>
          {isInProduction ? (
            <span style={{ color: 'green' }}>yes</span>
          ) : (
            <span style={{ color: 'red' }}>no</span>
          )}
        </strong>
        <br />
      </p>
    </React.Fragment>
  );
}
