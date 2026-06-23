import { MongoClient, Db, Collection } from 'mongodb';
import { CONFIG } from '../config';
import type { RealEstateListing } from '../types/real-estate.types';

interface StoredListing extends RealEstateListing {
  uniqueKey: string; // domain:listingId
  firstSeenAt: Date;
  lastSeenAt: Date;
  lastUpdatedAt: Date;
  active: boolean; // false once the listing stops appearing in crawls (delisted)
  delistedAt?: Date;
  priceHistory?: Array<{
    amount: number;
    currency: string;
    usdAmount?: number;
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
      await this.collection.createIndex({ active: 1 });
      await this.collection.createIndex({ active: 1, lastSeenAt: -1 });

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
        const result = await this.upsertListing(listing);
        stats[result]++;
      } catch (error) {
        console.error(`Failed to upsert listing ${listing.listingId}:`, error);
        stats.errors++;
      }
    }

    return stats;
  }

  /**
   * Upsert a single listing.
   * - New listing: inserted with the first observed price seeded into history.
   * - Existing listing: every field is refreshed (details, price, location,
   *   images, metadata, ...), `firstSeenAt` is preserved, and a price-history
   *   entry is appended only when the price actually changed.
   * Returns whether the listing was inserted or updated.
   */
  private async upsertListing(listing: RealEstateListing): Promise<'inserted' | 'updated'> {
    if (!this.collection) {
      throw new Error('MongoDB not connected. Call connect() first.');
    }

    const uniqueKey = this.generateUniqueKey(listing.source.domain, listing.listingId);
    const now = new Date();

    const existing = await this.collection.findOne({ uniqueKey });

    if (!existing) {
      const firstEntry = this.makePriceEntry(listing, now);
      const newListing: StoredListing = {
        ...listing,
        uniqueKey,
        firstSeenAt: now,
        lastSeenAt: now,
        lastUpdatedAt: now,
        active: true,
        priceHistory: firstEntry ? [firstEntry] : [],
      };
      await this.collection.insertOne(newListing);
      return 'inserted';
    }

    // Refresh all values; keep the original firstSeenAt. Seeing the listing
    // again means it is active (clears any previous delisting).
    const updates: Partial<StoredListing> = {
      ...listing,
      uniqueKey,
      firstSeenAt: existing.firstSeenAt,
      lastSeenAt: now,
      lastUpdatedAt: now,
      active: true,
      delistedAt: undefined,
    };

    // Maintain price history. Backfill a baseline entry for docs that have no
    // history yet (e.g. created before history seeding); otherwise append only
    // on a real price change. For USD-priced listings the PEN amount is
    // FX-converted and drifts daily, so compare on the USD figure when both
    // records have it to avoid spurious history entries.
    const priceHistory = existing.priceHistory ? [...existing.priceHistory] : [];
    if (priceHistory.length === 0 || this.priceChanged(existing, listing)) {
      const entry = this.makePriceEntry(listing, now);
      if (entry) priceHistory.push(entry);
    }
    updates.priceHistory = priceHistory;

    await this.collection.updateOne({ uniqueKey }, { $set: updates });
    return 'updated';
  }

  /** Build a price-history entry from a listing, or null if it has no price. */
  private makePriceEntry(
    listing: RealEstateListing,
    at: Date
  ): { amount: number; currency: string; usdAmount?: number; changedAt: Date } | null {
    if (!listing.price?.amount) return null;
    return {
      amount: listing.price.amount,
      currency: listing.price.currency,
      ...(listing.price.usdAmount != null ? { usdAmount: listing.price.usdAmount } : {}),
      changedAt: at,
    };
  }

  /** True when the listing's price differs from what is stored. */
  private priceChanged(existing: StoredListing, listing: RealEstateListing): boolean {
    const bothUsd = existing.price.usdAmount != null && listing.price.usdAmount != null;
    if (bothUsd) {
      return existing.price.usdAmount !== listing.price.usdAmount;
    }
    return existing.price.amount !== listing.price.amount;
  }

  private generateUniqueKey(domain: string, listingId: string): string {
    return `${domain}:${listingId}`;
  }

  /**
   * Mark listings not seen since `cutoff` as inactive (delisted). The window
   * should comfortably exceed the crawl interval so a single missed page does
   * not falsely delist a listing. Returns the number of newly delisted docs.
   */
  async markStaleListingsInactive(cutoff: Date): Promise<number> {
    if (!this.collection) {
      throw new Error('MongoDB not connected. Call connect() first.');
    }

    const result = await this.collection.updateMany(
      { active: { $ne: false }, lastSeenAt: { $lt: cutoff } },
      { $set: { active: false, delistedAt: new Date() } }
    );

    if (result.modifiedCount > 0) {
      console.log(`Marked ${result.modifiedCount} stale listing(s) as inactive (not seen since ${cutoff.toISOString()})`);
    }
    return result.modifiedCount;
  }

  /**
   * Get statistics about stored listings
   */
  async getStats(): Promise<any> {
    if (!this.collection) {
      return null;
    }

    // Stats reflect live listings only; delisted (inactive) docs are excluded.
    const activeFilter = { active: { $ne: false } };

    const [total, inactive, byType, byLocation, byPropertyType] = await Promise.all([
      this.collection.countDocuments(activeFilter),
      this.collection.countDocuments({ active: false }),
      this.collection
        .aggregate([
          { $match: activeFilter },
          { $group: { _id: '$listingType', count: { $sum: 1 } } },
        ])
        .toArray(),
      this.collection
        .aggregate([
          { $match: activeFilter },
          { $group: { _id: '$location.district', count: { $sum: 1 } } },
          { $sort: { count: -1 } },
          { $limit: 10 },
        ])
        .toArray(),
      this.collection
        .aggregate([
          { $match: activeFilter },
          { $group: { _id: '$propertyType', count: { $sum: 1 } } },
        ])
        .toArray(),
    ]);

    return {
      totalListings: total,
      delistedListings: inactive,
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
