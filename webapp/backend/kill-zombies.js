import mysql from 'mysql2/promise';

async function killZombieConnections() {
  const connection = await mysql.createConnection({
    host: '127.0.0.1',
    port: 3307,
    user: 'bananadmin',
    password: 'zwW:yT-69GIsyN7(vM)D#a+1nuoP',
    database: 'banana'
  });

  console.log('✅ Connected to MySQL\n');

  // Get all Sleep connections older than 10 seconds
  const [processes] = await connection.execute(`
    SELECT id, user, host, db, command, time, state
    FROM information_schema.processlist
    WHERE command = 'Sleep'
      AND time > 10
      AND user = 'bananadmin'
    ORDER BY time DESC
  `);

  console.log(`Found ${processes.length} zombie connections to kill\n`);

  let killed = 0;
  for (const proc of processes) {
    try {
      await connection.execute(`KILL ${proc.id}`);
      killed++;
      if (killed % 10 === 0) {
        console.log(`Killed ${killed}/${processes.length} connections...`);
      }
    } catch (error) {
      console.log(`Failed to kill connection ${proc.id}: ${error.message}`);
    }
  }

  console.log(`\n✅ Killed ${killed} zombie connections`);

  // Show remaining connections
  const [remaining] = await connection.execute(`
    SELECT
      SUBSTRING_INDEX(host, ':', 1) as client_host,
      COUNT(*) as connection_count
    FROM information_schema.processlist
    GROUP BY client_host
    ORDER BY connection_count DESC
  `);

  console.log('\n=== REMAINING CONNECTIONS ===');
  console.table(remaining);

  await connection.end();
}

killZombieConnections().catch(console.error);
