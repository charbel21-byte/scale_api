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

async function addColumnIfMissing(connection, tableName, columnName, definition) {
  try {
    await connection.query(
      `
      ALTER TABLE ${tableName}
      ADD COLUMN ${columnName} ${definition}
      `
    );

    console.log(`✅ Added column: ${tableName}.${columnName}`);
  } catch (error) {
    if (error.message.includes('Duplicate column name')) {
      console.log(`ℹ️ Column already exists: ${tableName}.${columnName}`);
      return;
    }

    console.error(`❌ Failed to add column: ${tableName}.${columnName}`);
    console.error(error.message);
    throw error;
  }
}

async function main() {
  const password = await ask('Paste Railway MYSQLPASSWORD: ');
  rl.close();

  const sqlFile = 'C:\\scale_app.sql';

  const connection = await mysql.createConnection({
    host: 'thomas.proxy.rlwy.net',
    port: 33349,
    user: 'root',
    password: password.trim(),
    database: 'railway',
    multipleStatements: true,
  });

  console.log('✅ Connected to Railway MySQL.');

  if (fs.existsSync(sqlFile)) {
    const sql = fs.readFileSync(sqlFile, 'utf8').trim();

    if (sql.isNotEmpty) {
      console.log('Importing SQL file...');

      await connection.query(sql);

      console.log('✅ Import finished successfully.');
    } else {
      console.log('⚠️ SQL file is empty. Skipping import.');
    }
  } else {
    console.log('⚠️ SQL file not found. Skipping import:', sqlFile);
  }

  console.log('Updating payroll_items table...');

  await addColumnIfMissing(
    connection,
    'payroll_items',
    'paid',
    'TINYINT(1) DEFAULT 0'
  );

  await addColumnIfMissing(
    connection,
    'payroll_items',
    'paid_from',
    'DATE NULL'
  );

  await addColumnIfMissing(
    connection,
    'payroll_items',
    'paid_to',
    'DATE NULL'
  );

  await addColumnIfMissing(
    connection,
    'payroll_items',
    'paid_at',
    'DATETIME NULL'
  );

  await addColumnIfMissing(
    connection,
    'payroll_items',
    'paid_by_uid',
    'VARCHAR(100) NULL'
  );

  await addColumnIfMissing(
    connection,
    'payroll_items',
    'paid_by_name',
    'VARCHAR(255) NULL'
  );

  await addColumnIfMissing(
    connection,
    'payroll_items',
    'payment_status',
    "VARCHAR(100) DEFAULT 'notPaid'"
  );

  console.log('✅ Payroll table updated.');

  const [columns] = await connection.query('DESCRIBE payroll_items');

  console.log('payroll_items columns:');
  console.table(columns);

  const [tables] = await connection.query('SHOW TABLES');

  console.log('Tables in Railway database:');
  console.table(tables);

  await connection.end();

  console.log('✅ Done.');
}

main().catch((error) => {
  console.error('❌ Import/update failed:');
  console.error(error.message);
  process.exit(1);
});