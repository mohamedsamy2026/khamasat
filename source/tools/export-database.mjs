import { createRequire } from 'node:module';
import { mkdir, writeFile } from 'node:fs/promises';
import { createWriteStream } from 'node:fs';
import { createGzip } from 'node:zlib';
import { once } from 'node:events';
import path from 'node:path';

const require = createRequire(import.meta.url);
const mysql = require('mysql2/promise');
if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required');
const destination = path.resolve(process.argv[2] || '../database');
await mkdir(destination, { recursive: true });
const connection = await mysql.createConnection({
  uri: process.env.DATABASE_URL,
  supportBigNumbers: true,
  bigNumberStrings: true,
  dateStrings: true,
  timezone: 'Z',
});
const outputPath = path.join(destination, 'athlete_ai_backup.sql.gz');
const gzip = createGzip({ level: 6 });
const output = createWriteStream(outputPath, { mode: 0o600 });
gzip.pipe(output);
const counts = {};
const identifier = name => '`' + name.replaceAll('`', '``') + '`';
const write = async text => {
  if (!gzip.write(text, 'utf8')) await once(gzip, 'drain');
};
const sqlValue = value => {
  if (value === null || value === undefined) return 'NULL';
  if (Buffer.isBuffer(value)) return "X'" + value.toString('hex') + "'";
  if (typeof value === 'object') return mysql.escape(JSON.stringify(value));
  return mysql.escape(value);
};
try {
  await connection.query('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ');
  await connection.beginTransaction();
  const [tables] = await connection.query('SHOW FULL TABLES');
  await write('-- ATHLETE AI project-scoped schema and data backup\n');
  await write('-- Use an EMPTY target database. No credentials are included.\n');
  await write("SET NAMES utf8mb4;\nSET TIME_ZONE='+00:00';\nSET SQL_MODE='NO_AUTO_VALUE_ON_ZERO';\nSET FOREIGN_KEY_CHECKS=0;\n\n");
  for (const table of tables) {
    const name = Object.values(table)[0];
    if (table.Table_type !== 'BASE TABLE') throw new Error('View export needs separate handling');
    const [definition] = await connection.query('SHOW CREATE TABLE ' + identifier(name));
    await write('-- Table ' + name + '\n' + definition[0]['Create Table'] + ';\n');
    const [rows] = await connection.query('SELECT * FROM ' + identifier(name));
    counts[name] = rows.length;
    for (const row of rows) {
      const names = Object.keys(row).map(identifier).join(',');
      const values = Object.values(row).map(sqlValue).join(',');
      await write('INSERT INTO ' + identifier(name) + ' (' + names + ') VALUES (' + values + ');\n');
    }
    await write('\n');
    console.log(name + ': ' + rows.length + ' rows');
  }
  await connection.commit();
  await write('SET FOREIGN_KEY_CHECKS=1;\n-- ATHLETE AI backup finished successfully\n');
  gzip.end();
  await once(output, 'close');
  await writeFile(path.join(destination, 'row-counts.json'), JSON.stringify({
    exportedAt: new Date().toISOString(),
    snapshot: 'repeatable-read transaction',
    includesVideoBinaryData: true,
    tables: counts,
  }, null, 2) + '\n');
  console.log('Backup completed: ' + outputPath);
} catch (error) {
  await connection.rollback().catch(() => {});
  gzip.destroy();
  output.destroy();
  throw error;
} finally {
  await connection.end();
}
