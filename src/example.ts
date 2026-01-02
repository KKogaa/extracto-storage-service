import { ProductExtractorService } from './services/product-extractor.service';
import { ProductStorageService } from './services/product-storage.service';
import { readFileSync } from 'fs';
import { join } from 'path';

/**
 * Example usage of the product extraction and storage system
 */
async function main() {
  console.log('=== Product Extraction & Storage Example ===\n');

  // Initialize services (stateless extractor)
  const extractor = new ProductExtractorService();
  const storage = new ProductStorageService();

  console.log('Registered strategies:', extractor.getRegisteredStrategies());
  console.log('');

  try {
    // Connect to MongoDB
    await storage.connect();

    // Example 1: Extract from Falabella Next.js data
    console.log('--- Example 1: Falabella Next.js Data ---');
    const nextData = JSON.parse(readFileSync(join(__dirname, '../next_data.json'), 'utf-8'));
    
    const result1 = extractor.extractProducts(
      nextData,
      'https://www.falabella.com.pe/falabella-pe/category/cat760706/Celulares-y-Telefonos',
      'job_001'
    );

    console.log(`Strategy used: ${result1.metadata.strategyUsed}`);
    console.log(`Extracted ${result1.metadata.totalExtracted} products`);
    
    if (result1.products.length > 0) {
      console.log('Sample product:', {
        id: result1.products[0].productId,
        name: result1.products[0].name,
        brand: result1.products[0].brand,
        price: result1.products[0].price,
      });
    }

    // Store products
    console.log('\nUpserting products to MongoDB...');
    const stats1 = await storage.upsertProducts(result1.products);
    console.log(`Result: ${stats1.inserted} inserted, ${stats1.updated} updated, ${stats1.errors} errors`);

    // Example 2: Extract from simple product array
    console.log('\n--- Example 2: Simple Product Array ---');
    const productsArray = JSON.parse(readFileSync(join(__dirname, '../products.json'), 'utf-8'));
    
    const result2 = extractor.extractProducts(
      productsArray,
      'https://www.falabella.com.pe/falabella-pe/category/cat760706/Celulares-y-Telefonos',
      'job_002'
    );

    console.log(`Strategy used: ${result2.metadata.strategyUsed}`);
    console.log(`Extracted ${result2.metadata.totalExtracted} products`);

    const stats2 = await storage.upsertProducts(result2.products);
    console.log(`Result: ${stats2.inserted} inserted, ${stats2.updated} updated, ${stats2.errors} errors`);

    // Query products
    console.log('\n--- Querying Products ---');
    
    // Get a specific product
    if (result1.products.length > 0) {
      const firstProduct = result1.products[0];
      const retrieved = await storage.getProduct(
        firstProduct.source.domain,
        firstProduct.productId
      );
      
      if (retrieved) {
        console.log('\nRetrieved product:');
        console.log(`  Name: ${retrieved.name}`);
        console.log(`  Brand: ${retrieved.brand}`);
        console.log(`  Price: ${retrieved.price.currency} ${retrieved.price.amount}`);
        console.log(`  First seen: ${retrieved.firstSeenAt}`);
        console.log(`  Last seen: ${retrieved.lastSeenAt}`);
        console.log(`  Version: ${retrieved.version}`);
        console.log(`  Price history entries: ${retrieved.priceHistory.length}`);
      }
    }

    // Search products
    const searchResults = await storage.searchProducts({
      domain: 'falabella',
      brand: 'XIAOMI',
      limit: 5,
    });

    console.log(`\nFound ${searchResults.length} XIAOMI products:`);
    searchResults.forEach((p) => {
      console.log(`  - ${p.name} (${p.price.currency} ${p.price.amount})`);
    });

    // Get statistics
    console.log('\n--- Storage Statistics ---');
    const stats = await storage.getStats();
    console.log(`Total products: ${stats.totalProducts}`);
    console.log('By domain:', stats.byDomain);
    console.log('Top brands:', Object.entries(stats.byBrand).slice(0, 5));

  } catch (error) {
    console.error('Error:', error);
  } finally {
    await storage.close();
  }
}

// Run if this file is executed directly
if (require.main === module) {
  main().catch(console.error);
}

export { main };
