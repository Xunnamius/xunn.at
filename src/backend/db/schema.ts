import type { DbSchema } from 'universe/backend/db';

export const schema: DbSchema = {
  databases: {
    'global-api--system': {
      collections: [
        {
          name: 'auth',
          indices: [{ spec: 'token', options: { unique: true } }]
        },
        {
          name: 'request-log',
          indices: [{ spec: 'token' }, { spec: 'ip' }]
        },
        {
          name: 'limited-log-mview',
          indices: [{ spec: 'token' }, { spec: 'ip' }]
        }
      ]
    },
    'global-api--xunn-at': {
      collections: [
        {
          name: 'link-map',
          indices: [
            {
              spec: 'shortId',
              options: { unique: true }
            }
          ]
        }
      ]
    }
  },
  aliases: {
    system: 'global-api--system',
    'xunn-at': 'global-api--xunn-at'
  }
};
