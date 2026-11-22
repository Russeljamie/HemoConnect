# HemoConnect

## Running tests

Tests use a dedicated PostgreSQL test database only; they never use the development database.

1. Create a separate PostgreSQL database named `hemoconnect_test` (or another name ending in `_test`).
2. Copy `.env.test.example` to `.env.test` and set `DATABASE_URL` to that test database. Set a unique test `JWT_SECRET` as well.
3. Run `npm run test:db:setup` to deploy the existing migrations and seed the test database.
4. Run `npm test` to execute the server tests.

Both commands load `.env.test` with override and abort before database work unless the parsed database name ends in `_test`.
