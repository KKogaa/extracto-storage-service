# Storage Service Refactoring - Domain and State Tracking

## Summary

Refactored the extracto-storage-service to persist:
1. **Final result state** (`completed` | `failed` | `unknown`)
2. **Domain** extracted from URL (e.g., `falabella.com.pe` → `falabella`)

## Changes Made

### 1. Type Definitions (`src/types/index.ts`)

Added new fields to `StoredResult`:
```typescript
state: 'completed' | 'failed' | 'unknown';
domain: string;
failureReason?: string;
```

### 2. Storage Service (`src/services/storage.service.ts`)

#### New Method: `extractDomain()`
Extracts clean domain name from URLs:
- `https://www.falabella.com.pe/...` → `falabella`
- `https://amazon.com/...` → `amazon`
- `https://shop.example.co.uk/...` → `example`

#### Updated: `saveResult()`
Now accepts:
- `result: FetchResult` - The scraping result
- `state: 'completed' | 'failed'` - Job final state (default: 'completed')
- `failureReason?: string` - Error message for failed jobs

Automatically extracts and stores domain from URL.

#### Updated: `createIndexes()`
Added new indexes for better query performance:
- `state` - Index on state field
- `domain` - Index on domain field
- `domain + state` - Compound index for filtering by both

#### Enhanced: `getStats()`
Now returns:
```typescript
{
  totalJobs: number;
  completedJobs: number;
  failedJobs: number;
  byDomain: {
    [domain: string]: {
      total: number;
      completed: number;
      failed: number;
    }
  }
}
```

### 3. Queue Listener (`src/services/queue-listener.service.ts`)

#### Completed Jobs
- Now explicitly passes `'completed'` state when saving successful jobs

#### Failed Jobs
- Now saves failed jobs to MongoDB with:
  - `state: 'failed'`
  - `failureReason` containing the error message
  - Extracts URL from job data to store domain

## Benefits

1. **Better Analytics**: Can now query jobs by domain and state
2. **Failure Tracking**: Failed jobs are persisted with error reasons
3. **Domain Insights**: Easy to see which domains have highest success/failure rates
4. **Scalability**: Indexed fields allow fast queries even with large datasets

## Example Usage

### Query all Falabella scraping results:
```javascript
db.scrape_jobs.find({ domain: "falabella" })
```

### Query failed jobs for a specific domain:
```javascript
db.scrape_jobs.find({ domain: "falabella", state: "failed" })
```

### Get stats by domain:
```javascript
const stats = await storageService.getStats();
console.log(stats.byDomain.falabella);
// Output: { total: 10, completed: 8, failed: 2 }
```

## MongoDB Document Example

```json
{
  "_id": "...",
  "jobId": "job-1767319779741-4wf96y4bj",
  "url": "https://www.falabella.com.pe/falabella-pe/category/cat760706/Celulares-y-Telefonos",
  "domain": "falabella",
  "state": "completed",
  "html": "<!DOCTYPE html>...",
  "fetchedAt": "2026-01-01T00:00:00.000Z",
  "storedAt": "2026-01-01T00:01:00.000Z",
  "actionResults": [...],
  "extractedData": {...}
}
```

## Migration Note

Existing documents in MongoDB will not have `state` and `domain` fields. Consider running a migration script if needed, or the fields will be added when documents are next updated.
