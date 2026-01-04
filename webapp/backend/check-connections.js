import mysql from 'mysql2/promise';

async function checkConnections() {
  const connection = await mysql.createConnection({
    host: '127.0.0.1',
    port: 3307,
    user: 'bananadmin',
    password: 'zwW:yT-69GIsyN7(vM)D#a+1nuoP',
    database: 'banana'
  });

  console.log('✅ Connected to MySQL\n');

  // Show processlist
  console.log('=== ACTIVE CONNECTIONS ===');
  const [processes] = await connection.execute('SHOW PROCESSLIST');
  console.table(processes);

  // Count connections by host
  console.log('\n=== CONNECTIONS BY HOST ===');
  const [hostCounts] = await connection.execute(`
    SELECT
      SUBSTRING_INDEX(host, ':', 1) as client_host,
      COUNT(*) as connection_count,
      SUM(CASE WHEN command != 'Sleep' THEN 1 ELSE 0 END) as active_queries
    FROM information_schema.processlist
    GROUP BY client_host
    ORDER BY connection_count DESC
  `);
  console.table(hostCounts);

  // Connection errors
  console.log('\n=== CONNECTION ERROR STATS ===');
  const [errorStats] = await connection.execute(`
    SHOW GLOBAL STATUS WHERE
      Variable_name LIKE 'Aborted%' OR
      Variable_name LIKE 'Connection_errors%' OR
      Variable_name = 'Max_used_connections' OR
      Variable_name = 'Threads_connected'
  `);
  console.table(errorStats);

  // Max connections config
  console.log('\n=== CONNECTION LIMITS ===');
  const [limits] = await connection.execute(`
    SHOW VARIABLES WHERE
      Variable_name IN ('max_connections', 'max_connect_errors', 'wait_timeout', 'interactive_timeout')
  `);
  console.table(limits);

  await connection.end();
}

checkConnections().catch(console.error);
