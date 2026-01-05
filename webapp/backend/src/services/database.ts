import mysql from 'mysql2/promise';

export interface Organization {
  id: number;
  name: string;
}

export interface ChatAgent {
  id: number;
  name: string;
  organization_id: number;
}

class Database {
  private pool: mysql.Pool | null = null;
  private retryCount = 0;
  private maxRetries = 5;
  private retryDelay = 2000;

  async initialize(): Promise<void> {
    const config = {
      host: process.env.MYSQL_HOST || '127.0.0.1',
      port: parseInt(process.env.MYSQL_PORT || '3306', 10),
      user: process.env.MYSQL_USER,
      password: process.env.MYSQL_PASSWORD,
      database: process.env.MYSQL_DATABASE,

      // Pool sizing (optimizado para auto-scaling)
      waitForConnections: true,
      connectionLimit: 3,              // REDUCIDO de 5 a 3
      queueLimit: 10,                  // CAMBIADO de 0 a 10

      // Connection health (previene zombies)
      enableKeepAlive: true,           // Mantiene conexiones vivas
      keepAliveInitialDelay: 10000,    // 10s antes de primer keepalive

      // Timeouts (protección)
      connectTimeout: 10000,           // 10s para establecer conexión inicial

      // Lifecycle (limpia conexiones idle)
      maxIdle: 2,                      // Máximo 2 conexiones idle en pool
      idleTimeout: 60000,              // 60s antes de cerrar conexión idle
    };

    // DEBUG: Log connection config (sin password)
    console.log('[DB] Initializing database connection with config:', {
      host: config.host,
      port: config.port,
      user: config.user,
      database: config.database,
      connectionLimit: config.connectionLimit,
      connectTimeout: config.connectTimeout,
    });

    while (this.retryCount < this.maxRetries) {
      try {
        console.log(`[DB] Attempt ${this.retryCount + 1}/${this.maxRetries}: Creating connection pool...`);
        this.pool = mysql.createPool(config);

        console.log(`[DB] Attempt ${this.retryCount + 1}/${this.maxRetries}: Testing connection...`);
        const startTime = Date.now();
        const connection = await this.pool.getConnection();
        const duration = Date.now() - startTime;

        console.log(`[DB] Attempt ${this.retryCount + 1}/${this.maxRetries}: Connection acquired in ${duration}ms`);
        connection.release();
        console.log(`[DB] Attempt ${this.retryCount + 1}/${this.maxRetries}: Connection released`);

        console.log('[DB] ✅ Database connection established successfully');
        console.log('[DB] Pool stats:', this.getPoolStats());
        return;
      } catch (error) {
        this.retryCount++;
        const errorMsg = error instanceof Error ? error.message : String(error);
        const errorCode = (error as any)?.code || 'UNKNOWN';
        const errorErrno = (error as any)?.errno || 'N/A';

        console.error(`[DB] ❌ Attempt ${this.retryCount}/${this.maxRetries} failed:`, {
          code: errorCode,
          errno: errorErrno,
          message: errorMsg,
        });

        if (this.retryCount >= this.maxRetries) {
          console.error('[DB] 💀 All connection attempts exhausted');
          throw new Error(`Failed to connect to database after ${this.maxRetries} attempts: ${error}`);
        }

        console.log(`[DB] ⏳ Retrying in ${this.retryDelay}ms...`);
        await new Promise(resolve => setTimeout(resolve, this.retryDelay));
      }
    }
  }

  async getOrganizations(): Promise<Organization[]> {
    if (!this.pool) {
      throw new Error('Database not initialized');
    }

    console.log('[DB] Executing query: getOrganizations');
    const startTime = Date.now();
    const [rows] = await this.pool.execute<mysql.RowDataPacket[]>(
      'SELECT id, name FROM organizations WHERE status_id = 1 ORDER BY name'
    );
    const duration = Date.now() - startTime;
    console.log(`[DB] Query completed in ${duration}ms, returned ${rows.length} organizations`);

    return rows as Organization[];
  }

  async getAgentsByOrganization(organizationId: number): Promise<ChatAgent[]> {
    if (!this.pool) {
      throw new Error('Database not initialized');
    }

    console.log(`[DB] Executing query: getAgentsByOrganization(${organizationId})`);
    const startTime = Date.now();
    const [rows] = await this.pool.execute<mysql.RowDataPacket[]>(
      'SELECT id, name, organization_id FROM chat_agents WHERE organization_id = ? AND status_id IN (233, 234) ORDER BY name',
      [organizationId]
    );
    const duration = Date.now() - startTime;
    console.log(`[DB] Query completed in ${duration}ms, returned ${rows.length} agents`);

    return rows as ChatAgent[];
  }

  getPoolStats(): object | null {
    if (!this.pool) {
      return null;
    }

    try {
      // Access mysql2 pool internals for metrics
      const poolInternal = (this.pool as any).pool;

      return {
        totalConnections: poolInternal._allConnections?.length || 0,
        freeConnections: poolInternal._freeConnections?.length || 0,
        queuedRequests: poolInternal._connectionQueue?.length || 0,
        config: {
          connectionLimit: 3,
          queueLimit: 10,
        },
      };
    } catch (error) {
      console.error('Error getting pool stats:', error);
      return { error: 'Unable to fetch pool stats' };
    }
  }

  async close(): Promise<void> {
    if (!this.pool) {
      console.log('[DB] Database pool already closed');
      return;
    }

    console.log('[DB] Closing database pool...');
    console.log('[DB] Pool stats before close:', this.getPoolStats());

    // Timeout de seguridad usando Promise.race
    const closePromise = this.pool.end();

    let timeoutId: NodeJS.Timeout;
    const timeoutPromise = new Promise<never>((_, reject) => {
      timeoutId = setTimeout(() => {
        reject(new Error('Database close timeout after 10 seconds'));
      }, 10000);
    });

    try {
      const startTime = Date.now();
      await Promise.race([closePromise, timeoutPromise]);
      const duration = Date.now() - startTime;
      clearTimeout(timeoutId!);
      this.pool = null;
      console.log(`[DB] ✅ Database pool closed successfully in ${duration}ms`);
    } catch (error) {
      clearTimeout(timeoutId!);
      console.error('[DB] ❌ Error closing database pool:', error);
      this.pool = null;
      throw error;
    }
  }
}

export const database = new Database();
