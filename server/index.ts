import express, { Request, Response } from 'express';
import { Pool } from 'pg';
import cors from 'cors';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

const app = express();
const port = process.env.PORT || 3001;

// Middleware
app.use(cors());
app.use(express.json());

// Create a connection pool
const pool = new Pool({
  connectionString: process.env.DATABASE_URL || process.env.DB_CONNECTION_STRING,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
  max: 20, // Maximum number of clients in the pool
  idleTimeoutMillis: 30000, // How long a client is allowed to remain idle before being closed
  connectionTimeoutMillis: 2000, // How long to wait for a connection
});

// Initialize database
async function initializeDatabase() {
  try {
    // Test the connection
    const client = await pool.connect();
    console.log('✅ Connected to the database.');

    await client.query(`
      CREATE TABLE IF NOT EXISTS wallet_addresses (
        wallet_address TEXT PRIMARY KEY,
        codes JSONB DEFAULT '{}'::jsonb
      );
    `);
    console.log('✅ Table ensured.');

    // Release the client back to the pool
    client.release();
  } catch (err) {
    console.error('❌ Error:', err);
  }
}

interface SaveCodeRequest {
  walletAddress: string;
  code: string;
  amount: number;
}

// API Routes
app.post('/api/save-code', async (req: Request<{}, {}, SaveCodeRequest>, res: Response) => {
  const client = await pool.connect();
  try {
    const { walletAddress, code, amount } = req.body;

    if (!walletAddress || !code || amount === undefined) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    // Check if wallet exists
    const walletExists = await client.query(
      'SELECT * FROM wallet_addresses WHERE wallet_address = $1',
      [walletAddress]
    );

    if (walletExists.rows.length === 0) {
      // Create new wallet entry
      await client.query(
        'INSERT INTO wallet_addresses (wallet_address, codes) VALUES ($1, $2)',
        [walletAddress, JSON.stringify({
          [code]: {
            value: code,
            created_at: new Date().toISOString(),
            is_used: false,
            amount: amount
          }
        })]
      );
    } else {
      // Update existing wallet's codes
      const currentCodes = walletExists.rows[0].codes || {};
      currentCodes[code] = {
        value: code,
        created_at: new Date().toISOString(),
        is_used: false,
        amount: amount
      };

      await client.query(
        'UPDATE wallet_addresses SET codes = $1 WHERE wallet_address = $2',
        [JSON.stringify(currentCodes), walletAddress]
      );
    }

    res.json({ success: true });
  } catch (error) {
    console.error('Error saving code:', error);
    res.status(500).json({ error: 'Failed to save code' });
  } finally {
    // Always release the client back to the pool
    client.release();
  }
});

app.get('/api/get-codes/:walletAddress', async (req: Request<{ walletAddress: string }>, res: Response) => {
  const client = await pool.connect();
  try {
    const { walletAddress } = req.params;
    
    const result = await client.query(
      'SELECT codes FROM wallet_addresses WHERE wallet_address = $1',
      [walletAddress]
    );

    if (result.rows.length === 0) {
      return res.json({ codes: {} });
    }

    res.json({ codes: result.rows[0].codes });
  } catch (error) {
    console.error('Error getting codes:', error);
    res.status(500).json({ error: 'Failed to get codes' });
  } finally {
    // Always release the client back to the pool
    client.release();
  }
});

// Handle pool errors
pool.on('error', (err, client) => {
  console.error('Unexpected error on idle client', err);
});

// Start server
initializeDatabase().then(() => {
  app.listen(port, () => {
    console.log(`Server running at http://localhost:${port}`);
  });
}); 