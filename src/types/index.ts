export interface FetchResult {
  jobId: string;
  url: string;
  html: string;
  screenshot?: string;
  statusCode?: number;
  headers?: Record<string, string>;
  fetchedAt: Date;
  actionResults?: ActionResult[];
  extractedData?: Record<string, any>;
}

export interface ActionResult {
  success: boolean;
  action: any;
  data?: any;
  error?: string;
  duration: number;
}

export interface StoredResult extends FetchResult {
  _id?: string;
  storedAt: Date;
  state: 'completed' | 'failed' | 'unknown';
  domain: string;
  failureReason?: string;
}

export * from './product.types';
