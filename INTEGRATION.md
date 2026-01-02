# Product Extraction Integration

## ✅ Integration Complete!

The Falabella strategy is now **automatically executed** when scraping jobs complete.

## Execution Flow

```
1. Spider Worker scrapes Falabella
   ↓
2. Job completes and pushes result to Redis queue
   ↓
3. Storage Service Queue Listener receives completion event
   ↓
4. Saves raw HTML to scrape_jobs collection
   ↓
5. Checks if result.extractedData exists
   ↓
6. Calls ProductExtractor.extractProducts()
   - Auto-detects format (Falabella vs Generic)
   - Uses appropriate strategy
   - Normalizes product data
   ↓
7. Calls ProductStorage.upsertProducts()
   - Generates unique key: domain:productId
   - If exists: UPDATE + add price to history
   - If new: INSERT with initial price history
   ↓
8. Products saved to products collection ✓
```

## When Does Extraction Execute?

**Automatically when:**
- A scraping job completes successfully
- The job result contains `extractedData` field
- The data matches Falabella format (or any registered strategy)

## Modified Files

1. **queue-listener.service.ts**
   - Added `ProductExtractorService` and `ProductStorageService`
   - Added `extractAndSaveProducts()` method
   - Calls extraction after saving scrape job

2. **index.ts**
   - Initializes `ProductStorageService`
   - Connects to products collection
   - Shows product stats

## How extractedData Should Be Populated

The Spider Worker needs to extract product JSON and put it in `extractedData`:

```typescript
// In spider-worker, after scraping:
const nextDataScript = await page.evaluate(() => {
  const script = document.getElementById('__NEXT_DATA__');
  return script ? JSON.parse(script.textContent) : null;
});

return {
  jobId: job.id,
  url: job.data.url,
  html: await page.content(),
  extractedData: nextDataScript, // ← This triggers product extraction
  fetchedAt: new Date(),
};
```

## Product Upsert Logic

```typescript
Unique Key = "falabella:20897639"

IF product exists:
  - Update all fields
  - Increment version
  - Add to priceHistory if price changed
  - Update lastSeenAt, lastUpdatedAt

ELSE:
  - Insert new product
  - Set firstSeenAt
  - Initialize priceHistory with current price
  - Set version = 1
```

## Verifying It Works

After a scraping job completes, check logs:

```
Job abc123 completed, saving to MongoDB...
Successfully stored job abc123
Extracted 48 products using Falabella strategy
Product upsert complete for job abc123: 48 new, 0 updated, 0 errors
```

## MongoDB Collections

- `scrape_jobs` - Raw HTML and scraping metadata
- `products` - Normalized product catalog with price history

## Next Steps

1. Deploy the updated storage service
2. Ensure spider worker populates `extractedData`
3. Monitor product extraction in logs
4. Query products collection to verify data
