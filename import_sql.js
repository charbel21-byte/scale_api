const fs = require('fs');
const mysql = require('mysql2/promise');
const readline = require('readline');

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

function ask(question) {
  return new Promise((resolve) => rl.question(question, resolve));
}

async function main() {
  const password = await ask('Paste Railway MYSQLPASSWORD: ');
  rl.close();

  const sqlFile = 'C:\\scale_app.sql';

  if (!fs.existsSync(sqlFile)) {
    console.error('SQL file not found:', sqlFile);
    process.exit(1);
  }

  const sql = fs.readFileSync(sqlFile, 'utf8');

  const connection = await mysql.createConnection({
    host: 'thomas.proxy.rlwy.net',
    port: 33349,
    user: 'root',
    password: password.trim(),
    database: 'railway',
    multipleStatements: true,
  });

  console.log('Connected to Railway MySQL...');
  console.log('Importing SQL file...');

  await connection.query(sql);

  console.log('Import finished successfully.');

  const [tables] = await connection.query('SHOW TABLES');
  console.log('Tables in Railway database:');
  console.table(tables);

  await connection.end();
}

main().catch((error) => {
  console.error('Import failed:');
  console.error(error.message);
  process.exit(1);
});