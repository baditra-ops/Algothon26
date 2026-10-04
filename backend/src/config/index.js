import dotenv from 'dotenv';

// Load environment variables from .env
dotenv.config();

export const config = {
  port: parseInt(process.env.PORT || '5000', 10),
  clientUrl: process.env.CLIENT_URL || 'http://localhost:5173',
  databaseUrl: process.env.DATABASE_URL || '',
  env: process.env.NODE_ENV || 'development'
};
