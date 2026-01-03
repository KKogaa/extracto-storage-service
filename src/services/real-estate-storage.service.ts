import { MongoClient, Db, Collection } from 'mongodb';
import { CONFIG } from '../config';
import type { RealEstateListing } from '../types/real-estate.types';

interface StoredListing extends RealEstateListing {
  uniqueKey: string; // domain:listingId
  firstSeenAt: Date;
  lastSeenAt: Date;
  lastUpdatedAt: Date;
  priceHistory?: Array<{
    amount: number;
    currency: string;
    changedAt: Date;
  }>;
}

/**
 * RealEstateStorageService
 * Handles MongoDB operations for real estate listings with upsert logic and price history
 */
export class RealEstateStorageService {
  private client: MongoClient;
  private db: Db | null = null;
  private collection: Collection<StoredListing> | null = null;

  constructor() {
    this.client = new MongoClient(CONFIG.mongodb.uri);
  }

  async connect(): Promise<void> {
    try {
      await this.client.connect();
      this.db = this.client.db(CONFIG.mongodb.database);
      this.collection = this.db.collection<StoredListing>('real_estate_listings');

      await this.createIndexes();

      console.log(`Connected to MongoDB real_estate_listings collection`);
    } catch (error) {
      console.error('Failed to connect to MongoDB (real estate):', error);
      throw error;
    }
  }

  private async createIndexes(): Promise<void> {
    if (!this.collection) return;

    try {
      // Unique key for upsert (domain:listingId)
      await this.collection.createIndex({ uniqueKey: 1 }, { unique: true });

      // Query indexes
      await this.collection.createIndex({ listingId: 1 });
      await this.collection.createIndex({ 'source.domain': 1 });
      await this.collection.createIndex({ listingType: 1 });
      await this.collection.createIndex({ propertyType: 1 });
      await this.collection.createIndex({ 'location.district': 1 });
      await this.collection.createIndex({ 'location.city': 1 });
      await this.collection.createIndex({ 'price.amount': 1 });
      await this.collection.createIndex({ 'details.bedrooms': 1 });
      await this.collection.createIndex({ 'details.bathrooms': 1 });
      await this.collection.createIndex({ lastSeenAt: -1 });
      await this.collection.createIndex({ firstSeenAt: -1 });

      // Compound indexes for common queries
      await this.collection.createIndex({ listingType: 1, 'location.district': 1 });
      await this.collection.createIndex({ propertyType: 1, 'price.amount': 1 });
      await this.collection.createIndex({ 'details.bedrooms': 1, 'location.district': 1 });

      // Text search
      await this.collection.createIndex({
        title: 'text',
        description: 'text',
        'location.district': 'text',
      });

      // Geospatial index for coordinates
      await this.collection.createIndex({ 'location.coordinates': '2dsphere' });

      console.log('MongoDB real estate indexes created');
    } catch (error) {
      console.error('Failed to create real estate indexes:', error);
    }
  }

  /**
   * Upsert multiple listings with upsert logic
   */
  async upsertListings(
    listings: RealEstateListing[]
  ): Promise<{ inserted: number; updated: number; errors: number }> {
    const stats = { inserted: 0, updated: 0, errors: 0 };

    for (const listing of listings) {
      try {
        await this.upsertListing(listing);
        const uniqueKey = this.generateUniqueKey(listing.source.domain, listing.listingId);
        const existing = await this.collection?.findOne({ uniqueKey });

        if (existing && existing.firstSeenAt.getTime() === existing.lastSeenAt.getTime()) {
          stats.inserted++;
        } else {
          stats.updated++;
        }
      } catch (error) {
        console.error(`Failed to upsert listing ${listing.listingId}:`, error);
        stats.errors++;
      }
    }

    return stats;
  }

  /**
   * Upsert a single listing
   */
  private async upsertListing(listing: RealEstateListing): Promise<void> {
    if (!this.collection) {
      throw new Error('MongoDB not connected. Call connect() first.');
    }

    const uniqueKey = this.generateUniqueKey(listing.source.domain, listing.listingId);

    try {
      const existing = await this.collection.findOne({ uniqueKey });
      const now = new Date();

      if (existing) {
        // Update existing listing
        const updates: Partial<StoredListing> = {
          ...listing,
          uniqueKey,
          lastSeenAt: now,
          lastUpdatedAt: now,
          firstSeenAt: existing.firstSeenAt,
        };

        // Track price history if price changed
        if (listing.price.amount !== existing.price.amount) {
          const priceHistory = existing.priceHistory || [];
          priceHistory.push({
            amount: existing.price.amount,
            currency: existing.price.currency,
            changedAt: now,
          });
          updates.priceHistory = priceHistory;
        } else {
          updates.priceHistory = existing.priceHistory;
        }

        await this.collection.updateOne({ uniqueKey }, { $set: updates });
      } else {
        // Insert new listing
        const newListing: StoredListing = {
          ...listing,
          uniqueKey,
          firstSeenAt: now,
          lastSeenAt: now,
          lastUpdatedAt: now,
          priceHistory: [],
        };

        await this.collection.insertOne(newListing);
      }
    } catch (error) {
      console.error(`Failed to upsert listing ${uniqueKey}:`, error);
      throw error;
    }
  }

  private generateUniqueKey(domain: string, listingId: string): string {
    return `${domain}:${listingId}`;
  }

  /**
   * Get statistics about stored listings
   */
  async getStats(): Promise<any> {
    if (!this.collection) {
      return null;
    }

    const [total, byType, byLocation, byPropertyType] = await Promise.all([
      this.collection.countDocuments(),
      this.collection
        .aggregate([
          {
            $group: {
              _id: '$listingType',
              count: { $sum: 1 },
            },
          },
        ])
        .toArray(),
      this.collection
        .aggregate([
          {
            $group: {
              _id: '$location.district',
              count: { $sum: 1 },
            },
          },
          { $sort: { count: -1 } },
          { $limit: 10 },
        ])
        .toArray(),
      this.collection
        .aggregate([
          {
            $group: {
              _id: '$propertyType',
              count: { $sum: 1 },
            },
          },
        ])
        .toArray(),
    ]);

    return {
      totalListings: total,
      byType: byType.reduce((acc, item) => {
        acc[item._id || 'unknown'] = item.count;
        return acc;
      }, {} as Record<string, number>),
      byPropertyType: byPropertyType.reduce((acc, item) => {
        acc[item._id || 'unknown'] = item.count;
        return acc;
      }, {} as Record<string, number>),
      topDistricts: byLocation.map((item) => ({
        district: item._id,
        count: item.count,
      })),
    };
  }

  async close(): Promise<void> {
    await this.client.close();
    console.log('Real estate storage connection closed');
  }
}
