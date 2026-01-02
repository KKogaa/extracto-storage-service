import type { ExtractionStrategy, Product, ProductPrice } from '../../types/product.types';
import { BaseExtractionStrategy } from './base.strategy';

/**
 * FalabellaStrategy
 * Handles Falabella Next.js product data extraction
 */
export class FalabellaStrategy extends BaseExtractionStrategy implements ExtractionStrategy {
  readonly name = 'Falabella';

  canHandle(data: any, url: string): boolean {
    const isFalabellaUrl = url.includes('falabella.com');
    const hasNextJsStructure = data?.props?.pageProps?.results !== undefined;
    const hasFalabellaProducts =
      Array.isArray(data) &&
      data.length > 0 &&
      data[0]?.displayName !== undefined &&
      data[0]?.mediaUrls !== undefined;

    return isFalabellaUrl || hasNextJsStructure || hasFalabellaProducts;
  }

  extract(data: any, url: string, jobId?: string): Product[] {
    try {
      let products: any[] = [];

      if (data?.props?.pageProps?.results) {
        products = data.props.pageProps.results;
      } else if (Array.isArray(data)) {
        products = data;
      } else if (data?.productId && data?.displayName) {
        products = [data];
      }

      const domain = this.extractDomain(url);

      return products
        .filter((item) => item.productId && item.displayName)
        .map((item) => this.normalizeProduct(item, domain, url, jobId));
    } catch (error) {
      console.error('Falabella extraction error:', error);
      return [];
    }
  }

  private normalizeProduct(item: any, domain: string, sourceUrl: string, jobId?: string): Product {
    const productId = item.productId || item.skuId || '';
    const price = this.extractPrice(item);
    const rating = this.buildRating(item.rating, item.totalReviews || item.reviews);

    const product: Product = {
      productId,
      name: item.displayName || '',
      brand: item.brand,
      price,
      ...(rating && { rating }),
      media: {
        urls: item.mediaUrls || [],
        primaryImageUrl: item.mediaUrls?.[0],
      },
      availability: {
        homeDelivery: item.availability?.homeDeliveryShipping !== '',
        pickUpFromStore: item.availability?.pickUpFromStoreShipping !== '',
        international: item.availability?.internationalShipping !== '',
        nextDay: item.meatStickers?.some((s: any) => s.type === 'next_day') || false,
      },
      source: {
        domain,
        url: item.url || sourceUrl,
        scrapedAt: new Date(),
        ...(jobId && { jobId }),
      },
      seoUrl: item.url || sourceUrl,
      isSponsored: item.isSponsored || false,
      rawData: item,
    };

    if (item.variants?.length > 0) product.variants = item.variants;
    if (item.topSpecifications?.length > 0) product.specifications = this.arrayToObject(item.topSpecifications);
    if (item.badges?.length > 0) product.badges = item.badges;
    if (item.promotions?.length > 0) product.promotions = item.promotions;
    if (item.sellerId) {
      product.seller = {
        id: item.sellerId,
        name: item.sellerName || item.sellerId,
      };
    }

    return product;
  }

  private extractPrice(item: any): ProductPrice {
    if (item.prices && Array.isArray(item.prices) && item.prices.length > 0) {
      const internetPrice = item.prices.find((p: any) => p.type === 'internetPrice') || item.prices[0];
      
      return {
        amount: this.parsePrice(internetPrice.price?.[0] || internetPrice.price || '0'),
        currency: this.extractCurrency(internetPrice.symbol || 'S/ '),
        label: internetPrice.label,
        isCrossed: internetPrice.crossed,
        type: internetPrice.type,
      };
    }

    const priceStr = String(item.price || '0');
    return {
      amount: this.parsePrice(priceStr),
      currency: this.extractCurrency(priceStr),
    };
  }

  private arrayToObject(arr: string[]): Record<string, string> {
    const result: Record<string, string> = {};
    arr.forEach((item, index) => {
      result[`spec_${index + 1}`] = item;
    });
    return result;
  }
}
