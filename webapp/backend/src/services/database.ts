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

    while (this.retryCount < this.maxRetries) {
      try {
        this.pool = mysql.createPool(config);
        // Test connection
        const connection = await this.pool.getConnection();
        connection.release();
        console.log('Database connection established');
        return;
      } catch (error) {
        this.retryCount++;
        console.log(`Database connection attempt ${this.retryCount}/${this.maxRetries} failed, retrying in ${this.retryDelay}ms...`);
        if (this.retryCount >= this.maxRetries) {
          throw new Error(`Failed to connect to database after ${this.maxRetries} attempts: ${error}`);
        }
        await new Promise(resolve => setTimeout(resolve, this.retryDelay));
      }
    }
  }

  async getOrganizations(): Promise<Organization[]> {
    if (!this.pool) {
      throw new Error('Database not initialized');
    }

    const [rows] = await this.pool.execute<mysql.RowDataPacket[]>(
      'SELECT id, name FROM organizations WHERE status_id = 1 ORDER BY name'
    );

    return rows as Organization[];
  }

  async getAgentsByOrganization(organizationId: number): Promise<ChatAgent[]> {
    if (!this.pool) {
      throw new Error('Database not initialized');
    }

    const [rows] = await this.pool.execute<mysql.RowDataPacket[]>(
      'SELECT id, name, organization_id FROM chat_agents WHERE organization_id = ? AND status_id IN (233, 234) ORDER BY name',
      [organizationId]
    );

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
      console.log('Database pool already closed');
      return;
    }

    console.log('Closing database pool...');

    // Timeout de seguridad usando Promise.race
    const closePromise = this.pool.end();

    let timeoutId: NodeJS.Timeout;
    const timeoutPromise = new Promise<never>((_, reject) => {
      timeoutId = setTimeout(() => {
        reject(new Error('Database close timeout after 10 seconds'));
      }, 10000);
    });

    try {
      await Promise.race([closePromise, timeoutPromise]);
      clearTimeout(timeoutId!);
      this.pool = null;
      console.log('Database pool closed successfully');
    } catch (error) {
      clearTimeout(timeoutId!);
      console.error('Error closing database pool:', error);
      this.pool = null;
      throw error;
    }
  }
}

export const database = new Database();
