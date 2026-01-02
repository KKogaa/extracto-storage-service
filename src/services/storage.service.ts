import { MongoClient, Db, Collection } from 'mongodb';
import { CONFIG } from '../config';
import type { FetchResult, StoredResult } from '../types';

export class StorageService {
  private client: MongoClient;
  private db: Db | null = null;
  private collection: Collection<StoredResult> | null = null;

  constructor() {
    this.client = new MongoClient(CONFIG.mongodb.uri);
  }

  /**
   * Extract domain from URL
   * Examples:
   * - https://www.falabella.com.pe/... -> falabella
   * - https://amazon.com/... -> amazon
   * - https://shop.example.co.uk/... -> example
   */
  private extractDomain(url: string): string {
    try {
      const urlObj = new URL(url);
      const hostname = urlObj.hostname;

      // Remove www. prefix
      const withoutWww = hostname.replace(/^www\./, '');

      // Split by dots
      const parts = withoutWww.split('.');

      // Common second-level domains (SLDs) in multi-level TLDs
      const commonSLDs = new Set(['com', 'co', 'org', 'net', 'gov', 'edu', 'ac']);

      if (parts.length >= 3) {
        // Check if second-to-last part is a common SLD (e.g., .com.pe, .co.uk)
        const secondToLast = parts[parts.length - 2];
        if (commonSLDs.has(secondToLast)) {
          // Multi-level TLD: take third from last
          // falabella.com.pe -> parts = [falabella, com, pe] -> falabella
          return parts[parts.length - 3];
        } else {
          // Regular domain: take second from last
          // subdomain.example.com -> parts = [subdomain, example, com] -> example
          return parts[parts.length - 2];
        }
      } else if (parts.length === 2) {
        // Simple domain: amazon.com -> parts = [amazon, com] -> amazon
        return parts[0];
      }

      // Single part, return as is
      return parts[0];
    } catch (error) {
      console.error('Failed to extract domain from URL:', url, error);
      return 'unknown';
    }
  }

  async connect(): Promise<void> {
    try {
      await this.client.connect();
      this.db = this.client.db(CONFIG.mongodb.database);
      this.collection = this.db.collection<StoredResult>('scrape_jobs');

      // Create indexes for better query performance
      await this.createIndexes();

      console.log(`Connected to MongoDB: ${CONFIG.mongodb.database}`);
    } catch (error) {
      console.error('Failed to connect to MongoDB:', error);
      throw error;
    }
  }

  private async createIndexes(): Promise<void> {
    if (!this.collection) return;

    try {
      await this.collection.createIndex({ jobId: 1 }, { unique: true });
      await this.collection.createIndex({ url: 1 });
      await this.collection.createIndex({ fetchedAt: -1 });
      await this.collection.createIndex({ storedAt: -1 });
      await this.collection.createIndex({ state: 1 });
      await this.collection.createIndex({ domain: 1 });
      await this.collection.createIndex({ domain: 1, state: 1 });
      console.log('MongoDB indexes created');
    } catch (error) {
      console.error('Failed to create indexes:', error);
    }
  }

  async saveResult(
    result: FetchResult,
    state: 'completed' | 'failed' = 'completed',
    failureReason?: string
  ): Promise<void> {
    if (!this.collection) {
      throw new Error('MongoDB not connected. Call connect() first.');
    }

    try {
      const domain = this.extractDomain(result.url);

      const storedResult: StoredResult = {
        ...result,
        storedAt: new Date(),
        state,
        domain,
        ...(failureReason && { failureReason }),
      };

      // Upsert to handle duplicate jobs
      await this.collection.updateOne(
        { jobId: result.jobId },
        { $set: storedResult },
        { upsert: true }
      );

      console.log(
        `Saved result for job ${result.jobId} to MongoDB (state: ${state}, domain: ${domain})`
      );
    } catch (error) {
      console.error(`Failed to save result for job ${result.jobId}:`, error);
      throw error;
    }
  }

  async getResult(jobId: string): Promise<StoredResult | null> {
    if (!this.collection) {
      throw new Error('MongoDB not connected. Call connect() first.');
    }

    return this.collection.findOne({ jobId });
  }

  async getStats(): Promise<{
    totalJobs: number;
    completedJobs: number;
    failedJobs: number;
    byDomain: Record<string, { total: number; completed: number; failed: number }>;
  }> {
    if (!this.collection) {
      throw new Error('MongoDB not connected. Call connect() first.');
    }

    const totalJobs = await this.collection.countDocuments();
    const completedJobs = await this.collection.countDocuments({ state: 'completed' });
    const failedJobs = await this.collection.countDocuments({ state: 'failed' });

    // Get stats grouped by domain
    const domainStats = await this.collection
      .aggregate([
        {
          $group: {
            _id: '$domain',
            total: { $sum: 1 },
            completed: {
              $sum: { $cond: [{ $eq: ['$state', 'completed'] }, 1, 0] },
            },
            failed: {
              $sum: { $cond: [{ $eq: ['$state', 'failed'] }, 1, 0] },
            },
          },
        },
      ])
      .toArray();

    const byDomain: Record<string, { total: number; completed: number; failed: number }> = {};
    domainStats.forEach((stat: any) => {
      byDomain[stat._id] = {
        total: stat.total,
        completed: stat.completed,
        failed: stat.failed,
      };
    });

    return { totalJobs, completedJobs, failedJobs, byDomain };
  }

  async close(): Promise<void> {
    if (this.client) {
      await this.client.close();
      this.db = null;
      this.collection = null;
      console.log('MongoDB connection closed');
    }
  }
}
