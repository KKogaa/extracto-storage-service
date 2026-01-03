import type { ExtractionStrategy, RealEstateListing } from '../../types/real-estate.types';
import { load } from 'cheerio';

/**
 * UrbaniaStrategy
 * Handles Urbania.pe real estate listing extraction
 */
export class UrbaniaStrategy implements ExtractionStrategy {
  readonly name = 'Urbania';

  canHandle(data: any, url: string): boolean {
    return url.includes('urbania.pe');
  }

  extract(data: any, url: string, jobId?: string): RealEstateListing[] {
    try {
      // If extractedData contains HTML, parse it with Cheerio
      if (typeof data === 'object' && data.html) {
        return this.extractFromHTML(data.html, url, jobId);
      }

      // If raw HTML string
      if (typeof data === 'string') {
        return this.extractFromHTML(data, url, jobId);
      }

      // If data is an object with parsed JSON (from extractedData.data)
      if (typeof data === 'object' && !data.html) {
        return this.extractFromJSON(data, url, jobId);
      }

      console.log('⚠️  Urbania: Unsupported data format');
      return [];
    } catch (error) {
      console.error('Urbania extraction error:', error);
      return [];
    }
  }

  private extractFromJSON(data: any, url: string, jobId?: string): RealEstateListing[] {
    try {
      console.log('Attempting to extract Urbania listings from JSON data');
      
      // Check if data is an array of listings (common API response format)
      if (Array.isArray(data)) {
        return data.map(item => this.parseJsonListing(item, url, jobId)).filter(Boolean) as RealEstateListing[];
      }
      
      // Check for nested listings array
      if (data.listings && Array.isArray(data.listings)) {
        return data.listings.map((item: any) => this.parseJsonListing(item, url, jobId)).filter(Boolean) as RealEstateListing[];
      }
      
      // Check for results array
      if (data.results && Array.isArray(data.results)) {
        return data.results.map((item: any) => this.parseJsonListing(item, url, jobId)).filter(Boolean) as RealEstateListing[];
      }
      
      // Single listing object
      if (data.id || data.listingId) {
        const listing = this.parseJsonListing(data, url, jobId);
        return listing ? [listing] : [];
      }
      
      console.log('⚠️  Could not find listings array in JSON data');
      return [];
    } catch (error) {
      console.error('JSON extraction error:', error);
      return [];
    }
  }

  private parseJsonListing(item: any, url: string, jobId?: string): RealEstateListing | null {
    try {
      const listing: RealEstateListing = {
        listingId: String(item.id || item.listingId || item.propertyId || `unknown-${Date.now()}`),
        source: {
          url: item.url || item.link || url,
          domain: 'urbania.pe',
          scrapedAt: new Date(),
          jobId,
        },
        title: item.title || item.name || 'Sin título',
        description: item.description || undefined,
        listingType: this.determineListingType(item),
        propertyType: this.determinePropertyType(item),
        price: {
          amount: parseFloat(item.price?.amount || item.price || 0),
          currency: item.price?.currency || 'PEN',
          period: item.price?.period || this.determinePricePeriod(url, item),
        },
        location: {
          country: 'Peru',
          city: item.location?.city || item.city || undefined,
          district: item.location?.district || item.district || undefined,
          region: item.location?.region || item.region || undefined,
          address: item.location?.address || item.address || undefined,
        },
        details: {
          bedrooms: parseInt(item.bedrooms || item.rooms || 0) || undefined,
          bathrooms: parseInt(item.bathrooms || 0) || undefined,
          parkingSpaces: parseInt(item.parking || item.parkingSpaces || 0) || undefined,
          totalArea: parseFloat(item.area || item.totalArea || 0) || undefined,
        },
        images: item.images || (item.image ? [item.image] : undefined),
      };

      return listing;
    } catch (error) {
      console.error('Failed to parse JSON listing:', error);
      return null;
    }
  }

  private determineListingType(item: any): RealEstateListing['listingType'] {
    const type = (item.type || item.listingType || '').toLowerCase();
    if (type.includes('alquiler') || type.includes('rent')) return 'rent';
    if (type.includes('venta') || type.includes('sale')) return 'sale';
    return 'other';
  }

  private determinePropertyType(item: any): RealEstateListing['propertyType'] {
    const type = (item.propertyType || item.category || '').toLowerCase();
    if (type.includes('departamento') || type.includes('apartment')) return 'apartment';
    if (type.includes('casa') || type.includes('house')) return 'house';
    if (type.includes('terreno') || type.includes('land')) return 'land';
    if (type.includes('oficina') || type.includes('office')) return 'office';
    return 'other';
  }

  private determinePricePeriod(url: string, item: any): 'monthly' | 'one_time' {
    const urlLower = url.toLowerCase();
    const isRent = urlLower.includes('alquiler') || urlLower.includes('rent') ||
                   (item.type && item.type.toLowerCase().includes('rent'));
    return isRent ? 'monthly' : 'one_time';
  }

  private extractFromHTML(html: string, url: string, jobId?: string): RealEstateListing[] {
    const $ = load(html);
    const listings: RealEstateListing[] = [];

    // First, try to extract JSON-LD structured data from script tags
    const jsonLdScripts = $('script[type="application/ld+json"]');
    console.log(`Found ${jsonLdScripts.length} JSON-LD script tags`);
    
    jsonLdScripts.each((_, element) => {
      try {
        const scriptContent = $(element).html();
        if (scriptContent) {
          const jsonData = JSON.parse(scriptContent);
          
          // Handle RealEstateListing schema
          if (jsonData['@type'] === 'RealEstateListing') {
            const extracted = this.extractFromJsonLd(jsonData, url, jobId);
            listings.push(...extracted);
          }
        }
      } catch (e) {
        console.log('Failed to parse JSON-LD:', e instanceof Error ? e.message : e);
      }
    });

    if (listings.length > 0) {
      console.log(`✅ Extracted ${listings.length} listings from JSON-LD`);
      return listings;
    }

    // Fallback: try traditional HTML selectors
    console.log('No JSON-LD data found, trying HTML selectors...');
    const listingCards = $('.listing-card, .property-card, [data-property-id]');
    console.log(`Found ${listingCards.length} potential listings on page`);

    listingCards.each((index, element) => {
      try {
        const $card = $(element);

        // Extract basic info
        const listingId = $card.attr('data-property-id') ||
                         $card.find('[data-property-id]').attr('data-property-id') ||
                         this.generateIdFromUrl($card.find('a').attr('href') || '');

        const title = $card.find('.title, .property-title, h2, h3').first().text().trim();
        const description = $card.find('.description, .property-description').first().text().trim();

        // Extract price
        const priceText = $card.find('.price, .property-price, [class*="price"]').first().text().trim();
        const price = this.parsePrice(priceText, url);

        // Extract location
        const locationText = $card.find('.location, .address, [class*="location"]').text().trim();
        const location = this.parseLocation(locationText);

        // Extract property details (bedrooms, bathrooms, etc.)
        const details = this.extractDetails($card);

        // Extract images
        const images = this.extractImages($card);

        // Determine listing type and property type from URL and title
        const types = this.determineTypes(url, title);

        // Extract listing URL
        const listingUrl = this.extractListingUrl($card, url);

        if (!listingId || !title) {
          console.log(`⚠️  Skipping listing ${index}: missing required fields`);
          return; // Skip this listing
        }

        const listing: RealEstateListing = {
          listingId,
          source: {
            url: listingUrl,
            domain: 'urbania.pe',
            scrapedAt: new Date(),
            jobId,
          },
          title,
          description: description || undefined,
          listingType: types.listingType,
          propertyType: types.propertyType,
          price,
          location,
          details,
          images: images.length > 0 ? images : undefined,
        };

        listings.push(listing);
      } catch (error) {
        console.error(`Failed to extract listing ${index}:`, error);
      }
    });

    console.log(`✅ Successfully extracted ${listings.length} Urbania listings`);
    return listings;
  }

  private extractFromJsonLd(jsonData: any, url: string, jobId?: string): RealEstateListing[] {
    const listings: RealEstateListing[] = [];
    
    try {
      // Handle mainEntity array (multiple listings)
      if (jsonData.mainEntity && Array.isArray(jsonData.mainEntity)) {
        for (const entity of jsonData.mainEntity) {
          const listing = this.parseJsonLdEntity(entity, jsonData, url, jobId);
          if (listing) listings.push(listing);
        }
      }
      // Single listing
      else if (jsonData.name || jsonData.description) {
        const listing = this.parseJsonLdEntity(jsonData, jsonData, url, jobId);
        if (listing) listings.push(listing);
      }
    } catch (error) {
      console.error('Error extracting from JSON-LD:', error);
    }
    
    return listings;
  }

  private parseJsonLdEntity(entity: any, parent: any, url: string, jobId?: string): RealEstateListing | null {
    try {
      // Extract listing ID from URL
      const listingUrl = entity.url || parent.url || url;
      const listingId = this.generateIdFromUrl(listingUrl);
      
      // Extract price from offers
      const offers = entity.offers || parent.offers;
      let priceAmount = 0;
      let priceCurrency = 'PEN';
      
      if (offers) {
        if (offers['@type'] === 'AggregateOffer') {
          priceAmount = parseFloat(offers.lowPrice || offers.highPrice || 0);
        } else {
          priceAmount = parseFloat(offers.price || 0);
        }
        priceCurrency = offers.priceCurrency || 'PEN';
      }
      
      // Extract location
      const contentLocation = entity.contentLocation || {};
      const location: RealEstateListing['location'] = {
        country: 'Peru',
        district: contentLocation.name || undefined,
      };
      
      // Determine types from URL and description
      const types = this.determineTypes(listingUrl, entity.name || '');
      
      const listing: RealEstateListing = {
        listingId,
        source: {
          url: listingUrl,
          domain: 'urbania.pe',
          scrapedAt: new Date(),
          jobId,
        },
        title: entity.name || 'Sin título',
        description: entity.description || undefined,
        listingType: types.listingType,
        propertyType: types.propertyType,
        price: {
          amount: priceAmount,
          currency: priceCurrency,
          period: types.listingType === 'rent' ? 'monthly' : 'one_time',
        },
        location,
        details: {},
        images: entity.image ? [entity.image] : undefined,
      };
      
      return listing;
    } catch (error) {
      console.error('Failed to parse JSON-LD entity:', error);
      return null;
    }
  }

  private parsePrice(priceText: string, url: string): RealEstateListing['price'] {
    // Remove non-numeric characters except decimal point
    const cleanPrice = priceText.replace(/[^\d.]/g, '');
    const amount = parseFloat(cleanPrice) || 0;

    // Determine if it's rent or sale from URL
    const isRent = url.includes('alquiler') || url.includes('rent');

    return {
      amount,
      currency: 'PEN', // Peruvian Sol
      period: isRent ? 'monthly' : 'one_time',
    };
  }

  private parseLocation(locationText: string): RealEstateListing['location'] {
    // Split location text (usually: "District, City, Region")
    const parts = locationText.split(',').map(s => s.trim());

    return {
      country: 'Peru',
      district: parts[0] || undefined,
      city: parts[1] || undefined,
      region: parts[2] || undefined,
    };
  }

  private extractDetails($card: any): RealEstateListing['details'] {
    const details: RealEstateListing['details'] = {};

    // Look for common patterns in listing cards
    const detailsText = $card.find('.details, .property-details, .features').text();

    // Extract bedrooms
    const bedroomsMatch = detailsText.match(/(\d+)\s*(?:dorm|hab|bedroom|recámara)/i);
    if (bedroomsMatch) {
      details.bedrooms = parseInt(bedroomsMatch[1]);
    }

    // Extract bathrooms
    const bathroomsMatch = detailsText.match(/(\d+)\s*(?:baño|bath|bathroom)/i);
    if (bathroomsMatch) {
      details.bathrooms = parseInt(bathroomsMatch[1]);
    }

    // Extract parking
    const parkingMatch = detailsText.match(/(\d+)\s*(?:estac|parking|garage)/i);
    if (parkingMatch) {
      details.parkingSpaces = parseInt(parkingMatch[1]);
    }

    // Extract area (m²)
    const areaMatch = detailsText.match(/(\d+(?:\.\d+)?)\s*m[²2]/i);
    if (areaMatch) {
      details.totalArea = parseFloat(areaMatch[1]);
    }

    return details;
  }

  private extractImages($card: any): string[] {
    const images: string[] = [];

    // Find images in various common locations
    $card.find('img').each((_: any, img: any) => {
      const $img = $card.constructor(img);
      const src = $img.attr('src') || $img.attr('data-src');
      if (src && !src.includes('placeholder') && !src.includes('logo')) {
        // Convert relative URLs to absolute
        const absoluteUrl = src.startsWith('http') ? src : `https://urbania.pe${src}`;
        images.push(absoluteUrl);
      }
    });

    return images;
  }

  private determineTypes(url: string, title: string): {
    listingType: RealEstateListing['listingType'];
    propertyType: RealEstateListing['propertyType'];
  } {
    const urlLower = url.toLowerCase();
    const titleLower = title.toLowerCase();

    // Determine listing type
    let listingType: RealEstateListing['listingType'] = 'other';
    if (urlLower.includes('alquiler') || urlLower.includes('rent')) {
      listingType = 'rent';
    } else if (urlLower.includes('venta') || urlLower.includes('sale')) {
      listingType = 'sale';
    }

    // Determine property type
    let propertyType: RealEstateListing['propertyType'] = 'other';
    if (titleLower.includes('departamento') || titleLower.includes('apartment')) {
      propertyType = 'apartment';
    } else if (titleLower.includes('casa') || titleLower.includes('house')) {
      propertyType = 'house';
    } else if (titleLower.includes('terreno') || titleLower.includes('land')) {
      propertyType = 'land';
    } else if (titleLower.includes('oficina') || titleLower.includes('office')) {
      propertyType = 'office';
    }

    return { listingType, propertyType };
  }

  private extractListingUrl($card: any, baseUrl: string): string {
    const href = $card.find('a').first().attr('href');
    if (!href) return baseUrl;

    // Convert relative URLs to absolute
    return href.startsWith('http') ? href : `https://urbania.pe${href}`;
  }

  private generateIdFromUrl(href: string): string {
    // Extract ID from URL or generate a hash
    const match = href.match(/\/(\d+)/);
    if (match) return match[1];

    // Fallback: use last part of URL
    const parts = href.split('/').filter(Boolean);
    return parts[parts.length - 1] || `unknown-${Date.now()}`;
  }
}
