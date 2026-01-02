# Product Extraction & Storage System

This is a **stateless, strategy-based** product extraction system that can handle multiple e-commerce websites.

## Architecture

### Key Components

1. **ExtractionStrategy Interface** - Each website implements this
2. **ProductExtractorService** - Stateless orchestrator that auto-detects formats
3. **ProductStorageService** - MongoDB persistence with upsert logic
4. **Website Strategies** - Pluggable extractors (Falabella, Generic, etc.)

### Benefits

- ✅ **Stateless**: Pure functions, no side effects
- ✅ **Extensible**: Add new sites by registering strategies
- ✅ **Auto-detection**: Automatically selects the right parser
- ✅ **Upsert logic**: Updates existing products, tracks price history
- ✅ **Unique IDs**: Uses `domain:productId` composite key

## Usage

### Basic Example

\`\`\`typescript
import { ProductExtractorService } from './services/product-extractor.service';
import { ProductStorageService } from './services/product-storage.service';

// Initialize (stateless)
const extractor = new ProductExtractorService();
const storage = new ProductStorageService();

await storage.connect();

// Extract products (auto-detects format)
const result = extractor.extractProducts(
  rawData,
  'https://www.falabella.com.pe/...',
  'job_123'
);

console.log(`Extracted ${result.metadata.totalExtracted} products`);
console.log(`Strategy used: ${result.metadata.strategyUsed}`);

// Store with upsert logic
const stats = await storage.upsertProducts(result.products);
console.log(`${stats.inserted} new, ${stats.updated} updated`);
\`\`\`

### Adding a New Website Strategy

\`\`\`typescript
import { ExtractionStrategy, Product } from '../types/product.types';
import { BaseExtractionStrategy } from './base.strategy';

export class AmazonStrategy extends BaseExtractionStrategy implements ExtractionStrategy {
  readonly name = 'Amazon';

  canHandle(data: any, url: string): boolean {
    return url.includes('amazon.com') || data?.asin !== undefined;
  }

  extract(data: any, url: string, jobId?: string): Product[] {
    // Custom Amazon parsing logic
    const domain = this.extractDomain(url);
    return data.items.map(item => this.normalizeProduct(item, domain, url, jobId));
  }

  private normalizeProduct(item: any, domain: string, url: string, jobId?: string): Product {
    // Transform Amazon format to standard Product format
    return this.createBaseProduct(
      item.asin,
      item.title,
      { amount: this.parsePrice(item.price), currency: 'USD' },
      domain,
      url,
      jobId
    );
  }
}

// Register it
extractor.registerStrategy(new AmazonStrategy());
\`\`\`

### Querying Products

\`\`\`typescript
// Get specific product
const product = await storage.getProduct('falabella', '20897639');

// Search products
const products = await storage.searchProducts({
  domain: 'falabella',
  brand: 'XIAOMI',
  minPrice: 500,
  maxPrice: 1000,
  limit: 20
});

// Get statistics
const stats = await storage.getStats();
console.log(stats.totalProducts);
console.log(stats.byDomain);
console.log(stats.byBrand);
\`\`\`

## Data Model

### Product Schema

\`\`\`typescript
interface Product {
  productId: string;           // Website's product ID
  name: string;
  brand?: string;
  price: ProductPrice;         // Current price
  rating?: ProductRating;
  media: ProductMedia;
  availability: ProductAvailability;
  source: {
    domain: string;            // e.g., "falabella"
    url: string;
    scrapedAt: Date;
    jobId?: string;
  };
  // ... more fields
}
\`\`\`

### Stored Product Schema

\`\`\`typescript
interface StoredProduct extends Product {
  uniqueKey: string;           // "domain:productId"
  firstSeenAt: Date;
  lastSeenAt: Date;
  lastUpdatedAt: Date;
  priceHistory: Array<{
    price: ProductPrice;
    recordedAt: Date;
  }>;
  version: number;             // Increments on update
}
\`\`\`

## Supported Formats

### Falabella

- Next.js `__NEXT_DATA__` structure
- Direct product arrays
- Single product objects

### Generic (Fallback)

- Handles common e-commerce JSON structures
- Supports various field naming conventions
- Auto-detects product-like objects

## Running the Example

\`\`\`bash
# Build
npm run build

# Run example with your data
npm run dev src/example.ts
\`\`\`

## Integration with Queue System

The product extraction can be integrated into your existing queue listener:

\`\`\`typescript
// In queue-listener.service.ts
import { ProductExtractorService } from './product-extractor.service';
import { ProductStorageService } from './product-storage.service';

const productExtractor = new ProductExtractorService();
const productStorage = new ProductStorageService();

await productStorage.connect();

worker.on('completed', async (job) => {
  const result = job.returnvalue;
  
  // Extract products from scraped data
  const extraction = productExtractor.extractProducts(
    result.extractedData,
    result.url,
    result.jobId
  );
  
  // Store products
  if (extraction.products.length > 0) {
    await productStorage.upsertProducts(extraction.products);
    console.log(\`Stored \${extraction.products.length} products\`);
  }
});
\`\`\`

## MongoDB Indexes

The system creates optimized indexes:
- `uniqueKey` (unique)
- `productId`
- `source.domain`
- `brand`
- `price.amount`
- `rating.value`
- Text search on `name` and `brand`

## Price History

The system automatically tracks price changes:
- Adds entry to `priceHistory` when price changes
- Keeps last 100 price entries
- Useful for price tracking and trend analysis
