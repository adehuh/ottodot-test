import { config } from 'dotenv';

// Integration tests use the DIRECT connection, never the pooler (R5.1).
config({ path: '.env.local', quiet: true });
config({ path: '.env', quiet: true });

if (!process.env.TEST_DATABASE_URL) {
  throw new Error(
    'TEST_DATABASE_URL is not set. Run `npm run db:start` and copy .env.example to .env.local.',
  );
}
