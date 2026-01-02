import { MongoClient, Db, Collection } from 'mongodb';
import { CONFIG } from '../config';
import type { Product, StoredProduct, ProductPrice } from '../types/product.types';

/**
 * ProductStorageService
 * Handles MongoDB operations for products with upsert logic and price history
 */
export class ProductStorageService {
  private client: MongoClient;
  private db: Db | null = null;
  private collection: Collection<StoredProduct> | null = null;

  constructor() {
    this.client = new MongoClient(CONFIG.mongodb.uri);
  }

  async connect(): Promise<void> {
    try {
      await this.client.connect();
      this.db = this.client.db(CONFIG.mongodb.database);
      this.collection = this.db.collection<StoredProduct>('products');

      await this.createIndexes();

      console.log(`Connected to MongoDB products collection`);
    } catch (error) {
      console.error('Failed to connect to MongoDB:', error);
      throw error;
    }
  }

  private async createIndexes(): Promise<void> {
    if (!this.collection) return;

    try {
      // Unique key for upsert (domain:productId)
      await this.collection.createIndex({ uniqueKey: 1 }, { unique: true });
      
      // Query indexes
      await this.collection.createIndex({ productId: 1 });
      await this.collection.createIndex({ 'source.domain': 1 });
      await this.collection.createIndex({ brand: 1 });
      await this.collection.createIndex({ 'source.domain': 1, brand: 1 });
      await this.collection.createIndex({ 'price.amount': 1 });
      await this.collection.createIndex({ 'rating.value': -1 });
      await this.collection.createIndex({ lastSeenAt: -1 });
      await this.collection.createIndex({ lastUpdatedAt: -1 });
      await this.collection.createIndex({ firstSeenAt: -1 });
      
      // Text search
      await this.collection.createIndex({ name: 'text', brand: 'text' });
      
      console.log('MongoDB product indexes created');
    } catch (error) {
      console.error('Failed to create indexes:', error);
    }
  }

  /**
   * Upsert a single product
   */
  async upsertProduct(product: Product): Promise<void> {
    if (!this.collection) {
      throw new Error('MongoDB not connected. Call connect() first.');
    }

    const uniqueKey = this.generateUniqueKey(product.source.domain, product.productId);

    try {
      const existing = await this.collection.findOne({ uniqueKey });
      const now = new Date();

      if (existing) {
        // Update existing product
        const updates: Partial<StoredProduct> = {
          ...product,
          uniqueKey,
          lastSeenAt: now,
          lastUpdatedAt: now,
          version: existing.version + 1,
          priceHistory: existing.priceHistory || [],
          firstSeenAt: existing.firstSeenAt,
        };

        // Add to price history if price changed
        if (this.priceChanged(existing.price, product.price)) {
          updates.priceHistory = [
            ...existing.priceHistory,
            {
              price: product.price,
              recordedAt: now,
            },
          ];

          // Keep only last 100 price history entries
          if (updates.priceHistory.length > 100) {
            updates.priceHistory = updates.priceHistory.slice(-100);
          }
        }

        await this.collection.updateOne({ uniqueKey }, { $set: updates });

        console.log(`Updated product: ${uniqueKey}`);
      } else {
        // Insert new product
        const storedProduct: StoredProduct = {
          ...product,
          uniqueKey,
          firstSeenAt: now,
          lastSeenAt: now,
          lastUpdatedAt: now,
          version: 1,
          priceHistory: [
            {
              price: product.price,
              recordedAt: now,
            },
          ],
        };

        await this.collection.insertOne(storedProduct);

        console.log(`Inserted new product: ${uniqueKey}`);
      }
    } catch (error) {
      console.error(`Failed to upsert product ${uniqueKey}:`, error);
      throw error;
    }
  }

  /**
   * Upsert multiple products in bulk
   */
  async upsertProducts(products: Product[]): Promise<{
    inserted: number;
    updated: number;
    errors: number;
  }> {
    let inserted = 0;
    let updated = 0;
    let errors = 0;

    for (const product of products) {
      try {
        const uniqueKey = this.generateUniqueKey(product.source.domain, product.productId);
        const existing = await this.collection?.findOne({ uniqueKey });

        await this.upsertProduct(product);

        if (existing) {
          updated++;
        } else {
          inserted++;
        }
      } catch (error) {
        console.error('Error upserting product:', error);
        errors++;
      }
    }

    console.log(`Bulk upsert complete: ${inserted} inserted, ${updated} updated, ${errors} errors`);

    return { inserted, updated, errors };
  }

  /**
   * Get product by unique key
   */
  async getProduct(domain: string, productId: string): Promise<StoredProduct | null> {
    if (!this.collection) {
      throw new Error('MongoDB not connected. Call connect() first.');
    }

    const uniqueKey = this.generateUniqueKey(domain, productId);
    return this.collection.findOne({ uniqueKey });
  }

  /**
   * Search products
   */
  async searchProducts(query: {
    domain?: string;
    brand?: string;
    minPrice?: number;
    maxPrice?: number;
    textSearch?: string;
    limit?: number;
    skip?: number;
  }): Promise<StoredProduct[]> {
    if (!this.collection) {
      throw new Error('MongoDB not connected. Call connect() first.');
    }

    const filter: any = {};

    if (query.domain) {
      filter['source.domain'] = query.domain;
    }

    if (query.brand) {
      filter.brand = query.brand;
    }

    if (query.minPrice !== undefined || query.maxPrice !== undefined) {
      filter['price.amount'] = {};
      if (query.minPrice !== undefined) {
        filter['price.amount'].$gte = query.minPrice;
      }
      if (query.maxPrice !== undefined) {
        filter['price.amount'].$lte = query.maxPrice;
      }
    }

    if (query.textSearch) {
      filter.$text = { $search: query.textSearch };
    }

    return this.collection
      .find(filter)
      .sort({ lastSeenAt: -1 })
      .limit(query.limit || 50)
      .skip(query.skip || 0)
      .toArray();
  }

  /**
   * Get statistics
   */
  async getStats(): Promise<{
    totalProducts: number;
    byDomain: Record<string, number>;
    byBrand: Record<string, number>;
  }> {
    if (!this.collection) {
      throw new Error('MongoDB not connected. Call connect() first.');
    }

    const totalProducts = await this.collection.countDocuments();

    const domainStats = await this.collection
      .aggregate([
        {
          $group: {
            _id: '$source.domain',
            count: { $sum: 1 },
          },
        },
      ])
      .toArray();

    const brandStats = await this.collection
      .aggregate([
        {
          $match: { brand: { $exists: true, $ne: null } },
        },
        {
          $group: {
            _id: '$brand',
            count: { $sum: 1 },
          },
        },
        {
          $sort: { count: -1 },
        },
        {
          $limit: 20,
        },
      ])
      .toArray();

    const byDomain: Record<string, number> = {};
    domainStats.forEach((stat: any) => {
      byDomain[stat._id] = stat.count;
    });

    const byBrand: Record<string, number> = {};
    brandStats.forEach((stat: any) => {
      byBrand[stat._id] = stat.count;
    });

    return { totalProducts, byDomain, byBrand };
  }

  async close(): Promise<void> {
    if (this.client) {
      await this.client.close();
      this.db = null;
      this.collection = null;
      console.log('MongoDB product connection closed');
    }
  }

  /**
   * Generate unique key for product
   */
  private generateUniqueKey(domain: string, productId: string): string {
    return `${domain}:${productId}`;
  }

  /**
   * Check if price has changed
   */
  private priceChanged(oldPrice: ProductPrice, newPrice: ProductPrice): boolean {
    return (
      oldPrice.amount !== newPrice.amount ||
      oldPrice.currency !== newPrice.currency
    );
  }
}
