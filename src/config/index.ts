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
  // Listings not seen within this window are marked inactive (delisted).
  // Defaults to 26h so a single missed 12h crawl never falsely delists.
  staleListingHours: parseInt(process.env.STALE_LISTING_HOURS || '26', 10),
  staleSweepIntervalMinutes: parseInt(process.env.STALE_SWEEP_INTERVAL_MINUTES || '60', 10),
} as const;
