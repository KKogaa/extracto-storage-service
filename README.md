# Extracto Storage Service

Storage service that listens to the scraping queue and persists results to MongoDB.

## Features

- Listens to BullMQ queue for completed scraping jobs
- Automatically saves results to MongoDB
- Creates optimized indexes for fast queries
- Handles duplicate jobs with upsert
- Provides statistics about stored jobs
- Graceful shutdown handling

## Architecture

```
Redis Queue (BullMQ)
      ↓
   [Job Completed Event]
      ↓
Storage Service (this)
      ↓
   MongoDB
```

## Installation

```bash
npm install
```

## Configuration

Copy `.env.example` to `.env` and configure:

```env
REDIS_HOST=localhost
REDIS_PORT=6379
MONGODB_URI=mongodb://admin:password@localhost:27017
MONGODB_DATABASE=extracto
NODE_ENV=development
```

## Development

```bash
# Install dependencies
npm install

# Start in development mode with hot reload
npm run dev
```

## Production

```bash
# Build
npm run build

# Start
npm start
```

## Docker

```bash
# Build image
docker build -t extracto-storage-service .

# Run container
docker run -d \
  -e REDIS_HOST=redis \
  -e MONGODB_URI=mongodb://admin:password@mongodb:27017 \
  --name extracto-storage \
  extracto-storage-service
```

## MongoDB Schema

### Collection: `scrape_jobs`

```typescript
{
  _id: ObjectId,
  jobId: string,              // Unique job identifier
  url: string,                // Scraped URL
  html: string,               // Full HTML content
  screenshot?: string,        // Base64 screenshot (if captured)
  statusCode?: number,        // HTTP status code
  headers?: object,           // Response headers
  fetchedAt: Date,            // When scraping completed
  storedAt: Date,             // When saved to MongoDB
  actionResults?: array,      // Results from each action
  extractedData?: object      // Extracted structured data
}
```

### Indexes

- `jobId`: Unique index for fast lookups
- `url`: Index for URL-based queries
- `fetchedAt`: Descending index for recent jobs
- `storedAt`: Descending index for recent storage

## How It Works

1. **Queue Listener**: Connects to Redis and listens for job completion events
2. **Event Handler**: When a job completes, retrieves the result
3. **Storage**: Saves the result to MongoDB with upsert (prevents duplicates)
4. **Stats**: Periodically logs queue and MongoDB statistics

## API

The service doesn't expose HTTP endpoints. It's a background worker that:
- Listens to queue events
- Saves to MongoDB
- Logs statistics

To query stored data, connect directly to MongoDB or create a separate query API.

## Monitoring

The service logs:
- Job completion and storage status
- Queue statistics (every 30s)
- MongoDB statistics (every 30s)
- Connection status
- Errors

Example output:
```
Starting Extracto Storage Service...
Environment: development
MongoDB: extracto
Redis: localhost:6379
Connected to MongoDB: extracto
MongoDB indexes created
Queue listener started for: fetch-queue
Extracto Storage Service is running
Job 5 completed, saving to MongoDB...
Saved result for job 5 to MongoDB
Successfully stored job 5
Queue Stats: { waiting: 0, active: 0, completed: 5, failed: 0 }
MongoDB Stats: { totalJobs: 5, successfulJobs: 5, failedJobs: 0 }
```

## Integration

### With extracto-spider-worker

The spider-worker completes jobs and returns results to the queue. This service automatically picks them up and saves them.

No configuration needed on the worker side - just ensure both services use the same:
- Redis host/port
- Queue name (`fetch-queue`)

### With extracto-fetch-api

The API creates jobs in the queue. This service saves the results when workers complete them.

## Error Handling

- **MongoDB Connection Failure**: Service exits with error
- **Queue Connection Failure**: Service exits with error
- **Save Failure**: Logged but service continues
- **Duplicate Jobs**: Handled via upsert

## Future Enhancements

- [ ] Add data extraction/transformation before saving
- [ ] Support multiple MongoDB collections (by domain/type)
- [ ] Add webhook notifications on save
- [ ] Implement retry logic for failed saves
- [ ] Add metrics/monitoring (Prometheus)
- [ ] Support saving to S3/cloud storage
- [ ] Add data validation schemas
