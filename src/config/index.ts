import { config } from 'dotenv';

config();

export const CONFIG = {
  redis: {
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379', 10),
  },
  mongodb: {
    uri: process.env.MONGODB_URI || 'mongodb://admin:extracto-secure-password-2025@localhost:27017',
    database: process.env.MONGODB_DATABASE || 'extracto',
  },
  nodeEnv: process.env.NODE_ENV || 'development',
  queue: {
    name: 'fetch-queue',
  },
} as const;
