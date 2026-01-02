import type { ExtractionStrategy, Product, ProductPrice } from '../../types/product.types';
import { BaseExtractionStrategy } from './base.strategy';

/**
 * GenericStrategy
 * Fallback strategy for unknown e-commerce formats
 */
export class GenericStrategy extends BaseExtractionStrategy implements ExtractionStrategy {
  readonly name = 'Generic';

  canHandle(data: any, url: string): boolean {
    return true;
  }

  extract(data: any, url: string, jobId?: string): Product[] {
    try {
      let products: any[] = [];

      if (Array.isArray(data)) {
        products = data;
      } else if (data?.products && Array.isArray(data.products)) {
        products = data.products;
      } else if (data?.items && Array.isArray(data.items)) {
        products = data.items;
      } else if (data?.results && Array.isArray(data.results)) {
        products = data.results;
      } else if (this.looksLikeProduct(data)) {
        products = [data];
      }

      const domain = this.extractDomain(url);

      return products
        .filter((item) => this.looksLikeProduct(item))
        .map((item) => this.normalizeProduct(item, domain, url, jobId));
    } catch (error) {
      console.error('Generic extraction error:', error);
      return [];
    }
  }

  private looksLikeProduct(item: any): boolean {
    if (!item || typeof item !== 'object') return false;

    const hasId = !!(
      item.id ||
      item.productId ||
      item.sku ||
      item.skuId ||
      item.asin
    );

    const hasName = !!(
      item.name ||
      item.title ||
      item.displayName ||
      item.productName
    );

    return hasId && hasName;
  }

  private normalizeProduct(item: any, domain: string, sourceUrl: string, jobId?: string): Product {
    const productId = String(
      item.id ||
      item.productId ||
      item.sku ||
      item.skuId ||
      item.asin ||
      ''
    );

    const name = String(
      item.name ||
      item.title ||
      item.displayName ||
      'Unknown Product'
    );

    const price = this.extractPrice(item);
    const product = this.createBaseProduct(productId, name, price, domain, sourceUrl, jobId);

    if (item.brand) product.brand = String(item.brand);
    if (item.description) product.description = String(item.description);
    if (item.category) product.category = String(item.category);

    const imageUrls = this.extractImageUrls(item);
    if (imageUrls.length > 0) {
      product.media = {
        urls: imageUrls,
        primaryImageUrl: imageUrls[0],
      };
    }

    const rating = this.buildRating(
      item.rating || item.averageRating,
      item.reviews || item.reviewCount || item.numReviews
    );
    if (rating) product.rating = rating;

    product.availability = {
      homeDelivery: item.available !== false && item.inStock !== false,
    };

    if (item.url || item.link) {
      product.seoUrl = String(item.url || item.link);
    }

    product.rawData = item;

    return product;
  }

  private extractPrice(item: any): ProductPrice {
    const priceValue =
      item.price ||
      item.currentPrice ||
      item.salePrice ||
      item.amount ||
      0;

    const currency =
      item.currency ||
      (item.priceSymbol ? this.extractCurrency(item.priceSymbol) : 'USD');

    return {
      amount: this.parsePrice(priceValue),
      currency: typeof currency === 'string' ? currency : 'USD',
    };
  }

  private extractImageUrls(item: any): string[] {
    const urls: string[] = [];

    if (item.images && Array.isArray(item.images)) {
      urls.push(...item.images.map((img: any) => (typeof img === 'string' ? img : img.url)));
    } else if (item.imageUrls && Array.isArray(item.imageUrls)) {
      urls.push(...item.imageUrls);
    } else if (item.mediaUrls && Array.isArray(item.mediaUrls)) {
      urls.push(...item.mediaUrls);
    } else if (item.image) {
      urls.push(String(item.image));
    } else if (item.imageUrl) {
      urls.push(String(item.imageUrl));
    }

    return urls.filter((url) => typeof url === 'string' && url.length > 0);
  }
}
