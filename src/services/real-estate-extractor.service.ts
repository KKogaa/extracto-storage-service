import type { ExtractionStrategy, RealEstateExtractionResult } from '../types/real-estate.types';
import { UrbaniaStrategy } from './real-estate-strategies/urbania.strategy';

/**
 * RealEstateExtractorService
 * Stateless service that orchestrates real estate extraction using different strategies
 */
export class RealEstateExtractorService {
  private strategies: ExtractionStrategy[] = [];

  constructor() {
    // Register real estate extraction strategies
    this.registerStrategy(new UrbaniaStrategy());
    // Add more strategies here as needed (e.g., AdondeVivir, Properati, etc.)
  }

  /**
   * Register a new extraction strategy
   */
  registerStrategy(strategy: ExtractionStrategy): void {
    this.strategies.push(strategy);
  }

  /**
   * Extract real estate listings from raw data (stateless operation)
   * Auto-detects format and applies appropriate strategy
   */
  extractListings(data: any, url: string, jobId?: string): RealEstateExtractionResult {
    const errors: string[] = [];

    try {
      // Find matching strategy
      const strategy = this.findStrategy(data, url);

      if (!strategy) {
        errors.push('No strategy found for this real estate site');
        return {
          listings: [],
          metadata: {
            totalExtracted: 0,
            source: url,
            extractedAt: new Date(),
            errors,
          },
        };
      }

      // Extract listings using the strategy
      const listings = strategy.extract(data, url, jobId);

      return {
        listings,
        metadata: {
          totalExtracted: listings.length,
          source: url,
          extractedAt: new Date(),
          strategyUsed: strategy.name,
          ...(errors.length > 0 && { errors }),
        },
      };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      errors.push(`Extraction error: ${errorMsg}`);
      console.error('Real estate extraction failed:', error);

      return {
        listings: [],
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
  private findStrategy(data: any, url: string): ExtractionStrategy | null {
    // Try registered strategies in order
    for (const strategy of this.strategies) {
      if (strategy.canHandle(data, url)) {
        return strategy;
      }
    }

    // No strategy found
    return null;
  }

  /**
   * Get list of registered strategy names
   */
  getRegisteredStrategies(): string[] {
    return this.strategies.map((s) => s.name);
  }

  /**
   * Check if URL is a supported real estate site
   */
  isRealEstateSite(url: string): boolean {
    const realEstateDomains = [
      'urbania.pe',
      'adondevivir.com',
      'properati.com.pe',
      'nexoinmobiliario.pe',
      // Add more as needed
    ];

    return realEstateDomains.some(domain => url.includes(domain));
  }
}
