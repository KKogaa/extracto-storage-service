import { Queue, QueueEvents } from 'bullmq';
import { CONFIG } from '../config';
import { StorageService } from './storage.service';
import { ProductExtractorService } from './product-extractor.service';
import { ProductStorageService } from './product-storage.service';
import { RealEstateExtractorService } from './real-estate-extractor.service';
import { RealEstateStorageService } from './real-estate-storage.service';
import type { FetchResult } from '../types';

export class QueueListenerService {
  private queue: Queue;
  private queueEvents: QueueEvents;
  private storageService: StorageService;
  private productExtractor: ProductExtractorService;
  private productStorage: ProductStorageService;
  private realEstateExtractor: RealEstateExtractorService;
  private realEstateStorage: RealEstateStorageService;

  constructor(
    storageService: StorageService,
    productStorage?: ProductStorageService,
    realEstateStorage?: RealEstateStorageService
  ) {
    this.storageService = storageService;
    this.productExtractor = new ProductExtractorService();
    this.productStorage = productStorage || new ProductStorageService();
    this.realEstateExtractor = new RealEstateExtractorService();
    this.realEstateStorage = realEstateStorage || new RealEstateStorageService();

    this.queue = new Queue(CONFIG.queue.name, {
      connection: {
        host: CONFIG.redis.host,
        port: CONFIG.redis.port,
      },
    });

    this.queueEvents = new QueueEvents(CONFIG.queue.name, {
      connection: {
        host: CONFIG.redis.host,
        port: CONFIG.redis.port,
      },
    });
  }

  async start(): Promise<void> {
    console.log(`Queue listener started for: ${CONFIG.queue.name}`);

    // Listen for completed jobs
    this.queueEvents.on('completed', async ({ jobId, returnvalue }) => {
      try {
        console.log(`Job ${jobId} completed, saving to MongoDB...`);

        const result = returnvalue as unknown as FetchResult;
        await this.storageService.saveResult(result, 'completed');

        console.log(`Successfully stored job ${jobId}`);

        // Determine if this is a real estate site or product site
        // Check both URL and extract domain from URL for matching
        const isRealEstate = this.realEstateExtractor.isRealEstateSite(result.url) || 
                             this.isRealEstateDomain(result.url);
        
        if (isRealEstate) {
          await this.extractAndSaveRealEstate(result);
        } else {
          await this.extractAndSaveProducts(result);
        }

        // Clean up the job from Redis after successful processing
        const job = await this.queue.getJob(jobId);
        if (job) {
          await job.remove();
          console.log(`Job ${jobId} removed from queue`);
        }
      } catch (error) {
        console.error(`Failed to store job ${jobId}:`, error);
      }
    });

    // Listen for failed jobs and save them with error information
    this.queueEvents.on('failed', async ({ jobId, failedReason }) => {
      try {
        console.log(`Job ${jobId} failed: ${failedReason}`);

        // Get the job data to extract URL
        const job = await this.queue.getJob(jobId);
        if (job && job.data) {
          const { url } = job.data;

          // Create a minimal FetchResult for failed jobs
          const failedResult: FetchResult = {
            jobId,
            url,
            html: '',
            fetchedAt: new Date(),
          };

          await this.storageService.saveResult(failedResult, 'failed', failedReason);
          console.log(`Saved failed job ${jobId} to MongoDB`);

          // Clean up the job from Redis after recording the failure
          await job.remove();
          console.log(`Failed job ${jobId} removed from queue`);
        }
      } catch (error) {
        console.error(`Failed to store failed job ${jobId}:`, error);
      }
    });

    this.queueEvents.on('error', (error) => {
      console.error('Queue events error:', error);
    });
  }

  /**
   * Check if URL domain is a real estate site by extracting domain
   */
  private isRealEstateDomain(url: string): boolean {
    try {
      const urlObj = new URL(url);
      const hostname = urlObj.hostname.replace(/^www\./, '');
      
      const realEstateDomains = [
        'urbania.pe',
        'urbania',  // Handle cases where only domain name is saved
        'adondevivir.com',
        'adondevivir',
        'properati.com.pe',
        'properati',
        'nexoinmobiliario.pe',
        'nexoinmobiliario',
      ];
      
      return realEstateDomains.some(domain => hostname.includes(domain));
    } catch (error) {
      return false;
    }
  }

  /**
   * Extract products from completed job and save to products collection
   */
  private async extractAndSaveProducts(result: FetchResult): Promise<void> {
    // Debug logging
    console.log(`[DEBUG] Job ${result.jobId} - Checking for product extraction...`);
    console.log(`[DEBUG] extractedData exists: ${!!result.extractedData}`);
    console.log(`[DEBUG] extractedData keys:`, result.extractedData ? Object.keys(result.extractedData) : 'none');
    
    if (!result.extractedData || Object.keys(result.extractedData).length === 0) {
      console.log(`⚠️  Job ${result.jobId} has no extractedData, skipping product extraction`);
      console.log(`💡 Tip: Use actions with "saveTo" parameter to populate extractedData`);
      return;
    }

    try {
      // Parse extractedData if needed
      let dataToExtract = this.prepareDataForExtraction(result.extractedData);
      
      if (!dataToExtract) {
        console.log(`⚠️  Could not prepare data for extraction from job ${result.jobId}`);
        return;
      }
      
      // Extract products using strategy pattern (auto-detects format)
      const extraction = this.productExtractor.extractProducts(
        dataToExtract,
        result.url,
        result.jobId
      );

      if (extraction.products.length === 0) {
        console.log(`⚠️  No products extracted from job ${result.jobId}`);
        console.log(`[DEBUG] Strategy used: ${extraction.metadata.strategyUsed}`);
        console.log(`[DEBUG] Extraction errors:`, extraction.metadata.errors);
        return;
      }

      console.log(
        `✅ Extracted ${extraction.products.length} products using ${extraction.metadata.strategyUsed} strategy`
      );

      // Save products with upsert logic
      const stats = await this.productStorage.upsertProducts(extraction.products);

      console.log(
        `✅ Product upsert complete for job ${result.jobId}: ${stats.inserted} new, ${stats.updated} updated, ${stats.errors} errors`
      );
    } catch (error) {
      console.error(`❌ Failed to extract/save products for job ${result.jobId}:`, error);
    }
  }

  /**
   * Extract real estate listings from completed job and save to real_estate_listings collection
   */
  private async extractAndSaveRealEstate(result: FetchResult): Promise<void> {
    console.log(`[DEBUG] Job ${result.jobId} - Detected real estate site, extracting listings...`);

    try {
      // For real estate, we primarily work with HTML
      const dataToExtract = result.html || result.extractedData;

      if (!dataToExtract) {
        console.log(`⚠️  Job ${result.jobId} has no HTML or extractedData for real estate extraction`);
        return;
      }

      // Extract listings using strategy pattern (auto-detects site)
      const extraction = this.realEstateExtractor.extractListings(
        dataToExtract,
        result.url,
        result.jobId
      );

      if (extraction.listings.length === 0) {
        console.log(`⚠️  No listings extracted from job ${result.jobId}`);
        console.log(`[DEBUG] Strategy used: ${extraction.metadata.strategyUsed}`);
        console.log(`[DEBUG] Extraction errors:`, extraction.metadata.errors);
        return;
      }

      console.log(
        `✅ Extracted ${extraction.listings.length} real estate listings using ${extraction.metadata.strategyUsed} strategy`
      );

      // Save listings with upsert logic
      const stats = await this.realEstateStorage.upsertListings(extraction.listings);

      console.log(
        `✅ Listing upsert complete for job ${result.jobId}: ${stats.inserted} new, ${stats.updated} updated, ${stats.errors} errors`
      );
    } catch (error) {
      console.error(`❌ Failed to extract/save real estate listings for job ${result.jobId}:`, error);
    }
  }

  /**
   * Prepare extractedData for product extraction
   * Handles cases where data is stored as JSON strings
   */
  private prepareDataForExtraction(extractedData: Record<string, any>): any {
    // Check common keys where product data might be stored
    const possibleKeys = ['productData', 'nextData', 'data', 'products'];
    
    for (const key of possibleKeys) {
      if (extractedData[key]) {
        const value = extractedData[key];
        
        // If it's a string, try to parse it as JSON
        if (typeof value === 'string') {
          try {
            console.log(`[DEBUG] Parsing ${key} as JSON (length: ${value.length})`);
            const parsed = JSON.parse(value);
            console.log(`[DEBUG] Successfully parsed ${key}`);
            return parsed;
          } catch (e) {
            console.log(`[DEBUG] Failed to parse ${key} as JSON:`, e instanceof Error ? e.message : e);
            continue;
          }
        } else if (typeof value === 'object' && value !== null) {
          // Already an object, use it directly
          console.log(`[DEBUG] Using ${key} as object`);
          return value;
        }
      }
    }
    
    // If no known keys found, return the extractedData as-is
    console.log(`[DEBUG] No known data keys found, using extractedData as-is`);
    return extractedData;
  }

  async close(): Promise<void> {
    await this.queueEvents.close();
    await this.queue.close();
    console.log('Queue listener closed');
  }

  async getQueueStats(): Promise<void> {
    const [waiting, active, completed, failed] = await Promise.all([
      this.queue.getWaitingCount(),
      this.queue.getActiveCount(),
      this.queue.getCompletedCount(),
      this.queue.getFailedCount(),
    ]);

    console.log('Queue Stats:', { waiting, active, completed, failed });
  }
}
