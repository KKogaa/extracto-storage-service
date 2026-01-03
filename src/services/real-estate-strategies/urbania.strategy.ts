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

      console.log('⚠️  Urbania: Unsupported data format');
      return [];
    } catch (error) {
      console.error('Urbania extraction error:', error);
      return [];
    }
  }

  private extractFromHTML(html: string, url: string, jobId?: string): RealEstateListing[] {
    const $ = load(html);
    const listings: RealEstateListing[] = [];

    // Urbania uses specific selectors for listing cards
    // These may need to be updated based on the actual HTML structure
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
    $card.find('img').each((_, img) => {
      const src = $(img).attr('src') || $(img).attr('data-src');
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
