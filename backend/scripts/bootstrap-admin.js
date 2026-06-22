const bcrypt = require('bcryptjs');
const pgp = require('pg-promise')();

function getArg(name) {
  const prefix = `--${name}=`;
  const valueArg = process.argv.find((arg) => arg.startsWith(prefix));
  return valueArg ? valueArg.slice(prefix.length) : '';
}

async function run() {
  const username = getArg('username').trim();
  const email = getArg('email').trim().toLowerCase();
  const password = getArg('password');

  if (!username || !email || !password) {
    console.error('Usage: npm run admin:bootstrap -- --username=<name> --email=<email> --password=<password>');
    process.exit(1);
  }

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
    const passwordHash = await bcrypt.hash(password, 10);

    const adminUser = await db.one(
      `INSERT INTO users (username, email, password_hash, role)
       VALUES ($1, $2, $3, 'admin')
       ON CONFLICT (username)
       DO UPDATE SET
         email = EXCLUDED.email,
         password_hash = EXCLUDED.password_hash,
         role = 'admin'
       RETURNING user_id, username, email, role`,
      [username, email, passwordHash]
    );

    console.log('Admin bootstrap complete:', adminUser);
  } catch (err) {
    console.error('Failed to bootstrap admin:', err.message || err);
    process.exitCode = 1;
  } finally {
    pgp.end();
  }
}

run();
