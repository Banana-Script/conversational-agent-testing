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
      waitForConnections: true,
      connectionLimit: 5,
      queueLimit: 0,
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

  async close(): Promise<void> {
    if (this.pool) {
      await this.pool.end();
      this.pool = null;
    }
  }
}

export const database = new Database();
