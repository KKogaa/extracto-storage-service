/**
 * Real Estate Listing Types
 */

export interface RealEstateListing {
  // Unique identifier
  listingId: string;

  // Source information
  source: {
    url: string;
    domain: string;
    scrapedAt: Date;
    jobId?: string;
  };

  // Basic information
  title: string;
  description?: string;

  // Type of listing
  listingType: 'sale' | 'rent' | 'vacation_rental' | 'shared' | 'other';
  propertyType: 'apartment' | 'house' | 'condo' | 'land' | 'commercial' | 'office' | 'other';

  // Price
  price: {
    amount: number;
    currency: string;
    period?: 'monthly' | 'daily' | 'one_time'; // For rent vs sale
    pricePerSqm?: number; // Price per square meter
  };

  // Location
  location: {
    country?: string;
    region?: string; // Department/State
    city?: string;
    district?: string; // District/Neighborhood
    address?: string;
    coordinates?: {
      lat: number;
      lng: number;
    };
  };

  // Property details
  details: {
    bedrooms?: number;
    bathrooms?: number;
    halfBathrooms?: number;
    parkingSpaces?: number;
    totalArea?: number; // in sqm
    builtArea?: number; // in sqm
    lotArea?: number; // in sqm
    floor?: number;
    totalFloors?: number;
    yearBuilt?: number;
    condition?: 'new' | 'excellent' | 'good' | 'needs_renovation' | 'under_construction';
  };

  // Features and amenities
  features?: string[];
  amenities?: string[];

  // Media
  images?: string[];
  videos?: string[];
  virtualTour?: string;

  // Contact
  contact?: {
    name?: string;
    phone?: string;
    email?: string;
    agency?: string;
    agentId?: string;
  };

  // Additional metadata
  metadata?: {
    publishedAt?: Date;
    updatedAt?: Date;
    expiresAt?: Date;
    viewCount?: number;
    featured?: boolean;
    verified?: boolean;
    [key: string]: any;
  };
}

export interface RealEstateExtractionResult {
  listings: RealEstateListing[];
  metadata: {
    totalExtracted: number;
    source: string;
    extractedAt: Date;
    strategyUsed?: string;
    errors?: string[];
  };
}

export interface ExtractionStrategy {
  name: string;
  canHandle(data: any, url: string): boolean;
  extract(data: any, url: string, jobId?: string): RealEstateListing[];
}
