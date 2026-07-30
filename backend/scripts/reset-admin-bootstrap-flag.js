const pgp = require('pg-promise')();

async function run() {
  const dbConfig = process.env.DATABASE_URL
    ? process.env.DATABASE_URL
    : {
        host: process.env.DB_HOST || process.env.HOST || 'db',
        port: Number(process.env.DB_PORT || 5432),
        database: process.env.POSTGRES_DB,
        user: process.env.POSTGRES_USER,
        password: process.env.POSTGRES_PASSWORD
      };

  const db = pgp(dbConfig);

  try {
    const result = await db.result(
      `DELETE FROM app_bootstrap_flags WHERE key = 'admin_bootstrap_done'`
    );

    console.log(`Reset complete. Deleted rows: ${result.rowCount}`);
  } catch (err) {
    console.error('Failed to reset admin bootstrap flag:', err.message || err);
    process.exitCode = 1;
  } finally {
    pgp.end();
  }
}

run();
