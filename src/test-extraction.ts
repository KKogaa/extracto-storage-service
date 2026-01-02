import { ProductExtractorService } from './services/product-extractor.service';
import { readFileSync } from 'fs';
import { join } from 'path';

async function test() {
  console.log('=== Testing Product Extraction (No DB) ===\n');

  const extractor = new ProductExtractorService();
  
  console.log('Registered strategies:', extractor.getRegisteredStrategies());
  console.log('');

  try {
    // Test with products.json
    console.log('--- Testing with products.json ---');
    const productsData = JSON.parse(readFileSync(join(__dirname, '../products.json'), 'utf-8'));
    
    const result = extractor.extractProducts(
      productsData,
      'https://www.falabella.com.pe/falabella-pe/category/cat760706/Celulares-y-Telefonos',
      'test_job_001'
    );

    console.log(`✓ Strategy used: ${result.metadata.strategyUsed}`);
    console.log(`✓ Extracted ${result.metadata.totalExtracted} products`);
    
    if (result.products.length > 0) {
      console.log('\n📦 Sample product:');
      const sample = result.products[0];
      console.log(`  ID: ${sample.productId}`);
      console.log(`  Name: ${sample.name}`);
      console.log(`  Brand: ${sample.brand}`);
      console.log(`  Price: ${sample.price.currency} ${sample.price.amount}`);
      console.log(`  Domain: ${sample.source.domain}`);
      console.log(`  Unique Key: ${sample.source.domain}:${sample.productId}`);
      if (sample.rating) {
        console.log(`  Rating: ${sample.rating.value} (${sample.rating.totalReviews} reviews)`);
      }
    }

    // Test with next_data.json
    console.log('\n--- Testing with next_data.json ---');
    const nextData = JSON.parse(readFileSync(join(__dirname, '../next_data.json'), 'utf-8'));
    
    const result2 = extractor.extractProducts(
      nextData,
      'https://www.falabella.com.pe/falabella-pe/category/cat760706/Celulares-y-Telefonos',
      'test_job_002'
    );

    console.log(`✓ Strategy used: ${result2.metadata.strategyUsed}`);
    console.log(`✓ Extracted ${result2.metadata.totalExtracted} products`);

    // Show unique products
    const uniqueProducts = new Set(result.products.map(p => p.productId));
    console.log(`\n✓ Unique product IDs: ${uniqueProducts.size}`);

    // Show brands
    const brands = new Set(result.products.map(p => p.brand).filter(Boolean));
    console.log(`✓ Brands found: ${Array.from(brands).join(', ')}`);

    // Price range
    const prices = result.products.map(p => p.price.amount);
    console.log(`✓ Price range: ${Math.min(...prices)} - ${Math.max(...prices)} ${result.products[0].price.currency}`);

    console.log('\n✅ Extraction test completed successfully!');

  } catch (error) {
    console.error('❌ Test failed:', error);
    process.exit(1);
  }
}

test().catch(console.error);
