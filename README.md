# HemoConnect

## Running tests

Tests load `.env.test` and use only the local PostgreSQL database named `hemoconnect_test`. They never use the development database.

1. Create a separate local PostgreSQL database named exactly `hemoconnect_test`.
2. Copy `.env.test.example` to `.env.test` and set `DATABASE_URL` to that test database. Set a unique test `JWT_SECRET` as well.
3. Run `npm run test:db:setup` to deploy the existing migrations and seed the test database.
4. Run `npm test` to execute the server tests.

Both commands load `.env.test` with override and abort before database work unless the database name is exactly `hemoconnect_test` and the host is local. The setup command runs the seed, which deletes and rebuilds data in its target database. The seed refuses to run against any other database unless `HEMOCONNECT_ALLOW_DEV_SEED=yes` is explicitly set; do not set that override for the development database.
