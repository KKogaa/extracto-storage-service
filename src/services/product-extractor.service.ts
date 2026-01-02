import type { ExtractionStrategy, ProductExtractionResult } from '../types/product.types';
import { FalabellaStrategy } from './extraction-strategies/falabella.strategy';
import { GenericStrategy } from './extraction-strategies/generic.strategy';

/**
 * ProductExtractorService
 * Stateless service that orchestrates product extraction using different strategies
 */
export class ProductExtractorService {
  private strategies: ExtractionStrategy[] = [];
  private fallbackStrategy: ExtractionStrategy;

  constructor() {
    // Register default strategies
    this.registerStrategy(new FalabellaStrategy());
    
    // Generic strategy is always the fallback
    this.fallbackStrategy = new GenericStrategy();
  }

  /**
   * Register a new extraction strategy
   */
  registerStrategy(strategy: ExtractionStrategy): void {
    this.strategies.push(strategy);
  }

  /**
   * Extract products from raw data (stateless operation)
   * Auto-detects format and applies appropriate strategy
   */
  extractProducts(data: any, url: string, jobId?: string): ProductExtractionResult {
    const errors: string[] = [];
    
    try {
      // Find matching strategy
      const strategy = this.findStrategy(data, url);
      
      // Extract products using the strategy
      const products = strategy.extract(data, url, jobId);

      return {
        products,
        metadata: {
          totalExtracted: products.length,
          source: url,
          extractedAt: new Date(),
          strategyUsed: strategy.name,
          ...(errors.length > 0 && { errors }),
        },
      };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      errors.push(`Extraction error: ${errorMsg}`);
      console.error('Product extraction failed:', error);

      return {
        products: [],
        metadata: {
          totalExtracted: 0,
          source: url,
          extractedAt: new Date(),
          errors,
        },
      };
    }
  }

  /**
   * Find the appropriate strategy for the data
   */
  private findStrategy(data: any, url: string): ExtractionStrategy {
    // Try registered strategies in order
    for (const strategy of this.strategies) {
      if (strategy.canHandle(data, url)) {
        return strategy;
      }
    }

    // Fall back to generic strategy
    return this.fallbackStrategy;
  }

  /**
   * Get list of registered strategy names
   */
  getRegisteredStrategies(): string[] {
    return this.strategies.map((s) => s.name);
  }
}
