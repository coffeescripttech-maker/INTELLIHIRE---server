/**
 * Gemini API Rate Limiter Utility
 * Handles rate limiting, retries, and exponential backoff for Gemini API calls
 */

class GeminiRateLimiter {
  constructor(options = {}) {
    this.maxRetries = options.maxRetries || 3;
    this.baseDelay = options.baseDelay || 1000; // 1 second
    this.maxDelay = options.maxDelay || 60000; // 60 seconds
    this.requestQueue = [];
    this.isProcessing = false;
    this.minRequestInterval = options.minRequestInterval || 2000; // 2 seconds between requests
    this.lastRequestTime = 0;
  }

  /**
   * Execute a Gemini API call with retry logic and rate limiting
   */
  async executeWithRetry(apiCall, context = 'API call') {
    let retryCount = 0;
    let lastError;

    while (retryCount < this.maxRetries) {
      try {
        // Enforce minimum interval between requests
        const now = Date.now();
        const timeSinceLastRequest = now - this.lastRequestTime;
        if (timeSinceLastRequest < this.minRequestInterval) {
          const waitTime = this.minRequestInterval - timeSinceLastRequest;
          console.log(`⏱️ Rate limiting: waiting ${waitTime}ms before next request`);
          await this.sleep(waitTime);
        }

        this.lastRequestTime = Date.now();
        const result = await apiCall();
        
        console.log(`✅ ${context} succeeded`);
        return result;
      } catch (error) {
        lastError = error;
        retryCount++;

        // Check if it's a rate limit error (429)
        if (error.status === 429 || error.message?.includes('quota')) {
          const waitTime = this.calculateBackoff(retryCount, error);
          
          console.log(
            `⏳ Rate limit hit for ${context}. Retry ${retryCount}/${this.maxRetries} after ${waitTime / 1000}s...`
          );

          if (retryCount < this.maxRetries) {
            await this.sleep(waitTime);
          }
        } else {
          // Non-rate-limit error, don't retry
          console.error(`❌ ${context} failed with non-retryable error:`, error.message);
          throw error;
        }
      }
    }

    // All retries exhausted
    console.error(`❌ ${context} failed after ${this.maxRetries} retries`);
    throw lastError || new Error(`Failed after ${this.maxRetries} retries`);
  }

  /**
   * Calculate exponential backoff delay
   */
  calculateBackoff(retryCount, error) {
    // Check if error contains retry delay suggestion
    if (error.errorDetails) {
      const retryInfo = error.errorDetails.find(
        detail => detail['@type'] === 'type.googleapis.com/google.rpc.RetryInfo'
      );
      if (retryInfo?.retryDelay) {
        const seconds = parseInt(retryInfo.retryDelay.replace('s', ''));
        return Math.min(seconds * 1000, this.maxDelay);
      }
    }

    // Exponential backoff: 2^retryCount * baseDelay
    const delay = Math.pow(2, retryCount) * this.baseDelay;
    return Math.min(delay, this.maxDelay);
  }

  /**
   * Sleep utility
   */
  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Queue a request to be processed sequentially
   */
  async queueRequest(apiCall, context = 'Queued API call') {
    return new Promise((resolve, reject) => {
      this.requestQueue.push({ apiCall, context, resolve, reject });
      this.processQueue();
    });
  }

  /**
   * Process queued requests one at a time
   */
  async processQueue() {
    if (this.isProcessing || this.requestQueue.length === 0) {
      return;
    }

    this.isProcessing = true;

    while (this.requestQueue.length > 0) {
      const { apiCall, context, resolve, reject } = this.requestQueue.shift();
      
      try {
        const result = await this.executeWithRetry(apiCall, context);
        resolve(result);
      } catch (error) {
        reject(error);
      }
    }

    this.isProcessing = false;
  }

  /**
   * Get queue status
   */
  getQueueStatus() {
    return {
      queueLength: this.requestQueue.length,
      isProcessing: this.isProcessing,
      lastRequestTime: this.lastRequestTime
    };
  }
}

// Create a singleton instance
const rateLimiter = new GeminiRateLimiter({
  maxRetries: 3,
  baseDelay: 1000,
  maxDelay: 60000,
  minRequestInterval: 2000 // 2 seconds between requests
});

module.exports = { GeminiRateLimiter, rateLimiter };
