import type { Product, ProductPrice, ProductRating } from '../../types/product.types';

/**
 * BaseExtractionStrategy
 * Provides common utility methods for all extraction strategies
 */
export abstract class BaseExtractionStrategy {
  /**
   * Extract domain from URL
   */
  protected extractDomain(url: string): string {
    try {
      const urlObj = new URL(url);
      const hostname = urlObj.hostname.replace(/^www\./, '');
      const parts = hostname.split('.');
      
      const commonSLDs = ['com', 'co', 'org', 'net', 'gov', 'edu'];
      
      if (parts.length >= 3) {
        const secondToLast = parts[parts.length - 2];
        if (commonSLDs.includes(secondToLast)) {
          return parts[parts.length - 3];
        }
        return parts[parts.length - 2];
      }
      
      return parts[0];
    } catch {
      return 'unknown';
    }
  }

  /**
   * Parse price string to number
   */
  protected parsePrice(priceStr: string | number): number {
    if (typeof priceStr === 'number') return priceStr;
    const cleaned = priceStr.replace(/[^0-9.]/g, '');
    return parseFloat(cleaned) || 0;
  }

  /**
   * Extract currency code from price string or symbol
   */
  protected extractCurrency(str: string): string {
    const currencyMap: Record<string, string> = {
      'S/': 'PEN',
      '$': 'USD',
      '€': 'EUR',
      '£': 'GBP',
      '¥': 'JPY',
      'R$': 'BRL',
      'ARS': 'ARS',
      'COP': 'COP',
      'CLP': 'CLP',
    };

    for (const [symbol, code] of Object.entries(currencyMap)) {
      if (str.includes(symbol)) return code;
    }

    return 'USD';
  }

  /**
   * Parse rating value
   */
  protected parseRating(rating: any): number {
    if (typeof rating === 'number') return rating;
    if (typeof rating === 'string') return parseFloat(rating) || 0;
    return 0;
  }

  /**
   * Parse review count
   */
  protected parseReviewCount(reviews: any): number {
    if (typeof reviews === 'number') return reviews;
    if (typeof reviews === 'string') return parseInt(reviews, 10) || 0;
    return 0;
  }

  /**
   * Build rating object if data is available
   */
  protected buildRating(ratingValue: any, reviewCount: any): ProductRating | undefined {
    const value = this.parseRating(ratingValue);
    const totalReviews = this.parseReviewCount(reviewCount);

    if (value > 0 && totalReviews > 0) {
      return { value, totalReviews };
    }

    return undefined;
  }

  /**
   * Create base product object with required fields
   */
  protected createBaseProduct(
    productId: string,
    name: string,
    price: ProductPrice,
    domain: string,
    url: string,
    jobId?: string
  ): Product {
    return {
      productId,
      name,
      price,
      media: { urls: [] },
      availability: { homeDelivery: false },
      source: {
        domain,
        url,
        scrapedAt: new Date(),
        ...(jobId && { jobId }),
      },
      seoUrl: url,
      isSponsored: false,
    };
  }
}
