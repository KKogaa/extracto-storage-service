import { StorageService } from './services/storage.service';
import { ProductStorageService } from './services/product-storage.service';
import { QueueListenerService } from './services/queue-listener.service';
import { CONFIG } from './config';

async function main() {
  console.log('Starting Extracto Storage Service...');
  console.log(`Environment: ${CONFIG.nodeEnv}`);
  console.log(`MongoDB: ${CONFIG.mongodb.database}`);
  console.log(`Redis: ${CONFIG.redis.host}:${CONFIG.redis.port}`);

  const storageService = new StorageService();
  const productStorage = new ProductStorageService();
  const queueListener = new QueueListenerService(storageService, productStorage);

  try {
    // Connect to MongoDB
    await storageService.connect();
    await productStorage.connect();

    // Start listening to queue
    await queueListener.start();

    // Print queue stats every 30 seconds
    setInterval(async () => {
      try {
        await queueListener.getQueueStats();
        const mongoStats = await storageService.getStats();
        console.log('MongoDB Stats (Scrape Jobs):', mongoStats);
        
        const productStats = await productStorage.getStats();
        console.log('MongoDB Stats (Products):', productStats);
      } catch (error) {
        console.error('Failed to get stats:', error);
      }
    }, 30000);

    console.log('Extracto Storage Service is running');
    console.log('✓ Scrape jobs will be saved to: scrape_jobs collection');
    console.log('✓ Products will be extracted and saved to: products collection');
  } catch (error) {
    console.error('Fatal error:', error);
    await cleanup(storageService, productStorage, queueListener);
    process.exit(1);
  }

  // Graceful shutdown
  process.on('SIGTERM', async () => {
    console.log('SIGTERM received, shutting down...');
    await cleanup(storageService, productStorage, queueListener);
    process.exit(0);
  });

  process.on('SIGINT', async () => {
    console.log('SIGINT received, shutting down...');
    await cleanup(storageService, productStorage, queueListener);
    process.exit(0);
  });
}

async function cleanup(
  storageService: StorageService,
  productStorage: ProductStorageService,
  queueListener: QueueListenerService
): Promise<void> {
  try {
    await queueListener.close();
    await storageService.close();
    await productStorage.close();
    console.log('Cleanup completed');
  } catch (error) {
    console.error('Error during cleanup:', error);
  }
}

main().catch((error) => {
  console.error('Unhandled error:', error);
  process.exit(1);
});
