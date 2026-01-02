export interface ProductPrice {
  amount: number;
  currency: string;
  label?: string;
  isCrossed?: boolean;
  type?: 'internetPrice' | 'listPrice' | 'cardPrice';
}

export interface ProductRating {
  value: number;
  totalReviews: number;
}

export interface ProductMedia {
  urls: string[];
  primaryImageUrl?: string;
}

export interface ProductAvailability {
  homeDelivery?: boolean;
  pickUpFromStore?: boolean;
  international?: boolean;
  nextDay?: boolean;
}

export interface ProductVariant {
  type: 'COLOR' | 'SIZE' | 'OTHER';
  options: Array<{
    id: string;
    value: string;
    available?: boolean;
  }>;
}

export interface ProductPromotion {
  type: string;
  description: string;
  startDate?: Date;
  endDate?: Date;
}

export interface ProductBadge {
  type: string;
  label: string;
  styles?: {
    backgroundColor?: string;
    textColor?: string;
  };
}

export interface Product {
  productId: string;
  name: string;
  brand?: string;
  description?: string;
  category?: string;
  price: ProductPrice;
  originalPrice?: ProductPrice;
  discount?: {
    percentage: number;
    amount: number;
  };
  rating?: ProductRating;
  media: ProductMedia;
  availability: ProductAvailability;
  variants?: ProductVariant[];
  specifications?: Record<string, string>;
  badges?: ProductBadge[];
  promotions?: ProductPromotion[];
  seller?: {
    id: string;
    name: string;
  };
  source: {
    domain: string;
    url: string;
    scrapedAt: Date;
    jobId?: string;
  };
  seoUrl: string;
  isSponsored: boolean;
  rawData?: any;
}

export interface StoredProduct extends Product {
  _id?: string;
  uniqueKey: string;
  firstSeenAt: Date;
  lastSeenAt: Date;
  lastUpdatedAt: Date;
  priceHistory: Array<{
    price: ProductPrice;
    recordedAt: Date;
  }>;
  version: number;
}

export interface ProductExtractionResult {
  products: Product[];
  metadata: {
    totalExtracted: number;
    source: string;
    extractedAt: Date;
    strategyUsed?: string;
    errors?: string[];
  };
}

export interface ExtractionStrategy {
  readonly name: string;
  canHandle(data: any, url: string): boolean;
  extract(data: any, url: string, jobId?: string): Product[];
}
