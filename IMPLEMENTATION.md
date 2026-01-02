# Storage Service Implementation

## Overview

The `extracto-storage-service` is a background worker that automatically persists scraping results to MongoDB.

## How It Works

```
1. Spider Worker completes job → Returns result to Redis queue
2. Storage Service listens to queue → Receives "completed" event
3. Storage Service → Saves result to MongoDB
4. MongoDB → Stores permanently with indexes
```

## Key Components

### 1. Queue Listener (`queue-listener.service.ts`)
- Connects to Redis via BullMQ
- Listens for `completed` events from the `fetch-queue`
- Extracts job results from events
- Passes results to Storage Service

### 2. Storage Service (`storage.service.ts`)
- Manages MongoDB connection
- Creates indexes on first run:
  - `jobId` (unique)
  - `url`
  - `fetchedAt` (descending)
  - `storedAt` (descending)
- Saves results with upsert (prevents duplicates)
- Provides stats about stored jobs

### 3. Main Entry Point (`index.ts`)
- Initializes both services
- Handles graceful shutdown
- Logs stats every 30 seconds

## Data Flow

```javascript
// 1. Worker completes job
{
  jobId: "5",
  url: "https://falabella.com.pe/...",
  html: "<html>...</html>",
  actionResults: [...],
  extractedData: {...},
  fetchedAt: "2026-01-01T20:15:22.922Z"
}

// 2. Storage service adds timestamp
{
  ...previousData,
  storedAt: "2026-01-01T20:15:23.100Z"  // Added
}

// 3. Saved to MongoDB collection: scrape_jobs
```

## MongoDB Schema

```typescript
interface StoredResult {
  _id: ObjectId;              // Auto-generated
  jobId: string;              // Unique job ID
  url: string;                // Scraped URL
  html: string;               // Full HTML content
  screenshot?: string;        // Base64 screenshot
  statusCode?: number;        // HTTP status
  headers?: object;           // Response headers
  fetchedAt: Date;            // When scraping completed
  storedAt: Date;             // When saved to DB (added by storage service)
  actionResults?: array;      // Action execution results
  extractedData?: object;     // Structured data from actions
}
```

## Configuration

Environment variables (`.env`):
```bash
REDIS_HOST=localhost              # Redis host
REDIS_PORT=6379                   # Redis port
MONGODB_URI=mongodb://...         # MongoDB connection string
MONGODB_DATABASE=extracto         # Database name
NODE_ENV=development              # Environment
```

## Testing

### Local Testing

1. **Start MongoDB** (if not running):
```bash
kubectl port-forward -n extracto svc/mongodb 27017:27017
```

2. **Start Redis**:
```bash
# Already running from spider-worker
```

3. **Start Storage Service**:
```bash
cd extracto-storage-service
npm run dev
```

4. **Submit a job** (via API):
```bash
curl -X POST http://localhost:3000/fetch \
  -H "Content-Type: application/json" \
  -d @../scrape_request.json
```

5. **Watch logs**:
```
Queue listener started for: fetch-queue
Job 6 completed, saving to MongoDB...
Saved result for job 6 to MongoDB
Successfully stored job 6
```

6. **Verify in MongoDB**:
```bash
kubectl exec -it -n extracto deployment/mongodb -- mongosh -u admin -p extracto-secure-password-2025 --authenticationDatabase admin

use extracto
db.scrape_jobs.find().pretty()
db.scrape_jobs.countDocuments()
```

## Deployment

### Docker

```bash
# Build
docker build -t extracto-storage-service .

# Run
docker run -d \
  -e REDIS_HOST=redis \
  -e MONGODB_URI=mongodb://admin:password@mongodb:27017 \
  extracto-storage-service
```

### Kubernetes

```bash
# Build and import image
docker build -t extracto-storage-service:latest .
docker save extracto-storage-service:latest | sudo k3s ctr images import -

# Deploy
kubectl apply -f ../extracto-devops/k8s/storage-deployment.yaml

# Check status
kubectl get pods -n extracto -l app=extracto-storage
kubectl logs -n extracto -f deployment/extracto-storage
```

## Monitoring

The service logs:
- Connection status (MongoDB, Redis)
- Job completion events
- Save operations (success/failure)
- Stats every 30 seconds

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

Queue Stats: { waiting: 0, active: 0, completed: 6, failed: 0 }
MongoDB Stats: { totalJobs: 6, successfulJobs: 6, failedJobs: 0 }
```

## Error Handling

### Duplicate Jobs
- Uses `upsert` to handle duplicates
- Updates existing record if jobId already exists

### Save Failures
- Logs error but continues running
- Doesn't crash the service
- Job remains in queue until successfully saved

### Connection Failures
- MongoDB: Service exits (fatal)
- Redis: Service exits (fatal)
- Automatic restart via k8s or Docker

## Performance

- **Lightweight**: ~128Mi memory
- **Fast**: Async event-driven architecture
- **Indexed queries**: Fast lookups by jobId, url, date
- **No blocking**: Doesn't slow down scraping

## Future Enhancements

### Data Processing (Coming Soon)
- Extract structured data from HTML
- Transform/clean data before saving
- Validate data schemas
- Multiple output formats

### Advanced Features
- Webhook notifications on save
- Multiple MongoDB collections (by domain)
- S3/cloud storage integration
- Data deduplication
- Metrics/monitoring (Prometheus)

## Integration

### Works With
- ✅ extracto-fetch-api (creates jobs)
- ✅ extracto-spider-worker (completes jobs)
- ✅ MongoDB (stores results)
- ✅ Redis (queue communication)

### Doesn't Require
- ❌ API changes
- ❌ Worker changes
- ❌ Additional configuration

Just start it and it automatically saves completed jobs!

## Troubleshooting

### Service won't start

**Check MongoDB connection**:
```bash
kubectl get svc -n extracto mongodb
kubectl exec -n extracto deployment/mongodb -- mongosh --eval "db.adminCommand('ping')"
```

**Check Redis connection**:
```bash
kubectl get svc -n extracto redis
```

### Jobs not being saved

**Check if jobs are completing**:
```bash
curl http://localhost:3000/queue/stats
```

**Check service logs**:
```bash
kubectl logs -n extracto deployment/extracto-storage
```

**Verify queue name matches**:
- Worker and Storage must use same queue name: `fetch-queue`

### Verify data in MongoDB

```bash
kubectl exec -it -n extracto deployment/mongodb -- mongosh -u admin -p extracto-secure-password-2025 --authenticationDatabase admin

use extracto
db.scrape_jobs.countDocuments()
db.scrape_jobs.findOne()
```
