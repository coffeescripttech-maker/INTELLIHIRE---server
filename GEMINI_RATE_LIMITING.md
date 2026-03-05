# Gemini API Rate Limiting Solution

## Problem
The application was hitting Google's Gemini API free tier rate limits, causing errors:
- `429 Too Many Requests`
- Quota exceeded for `generate_content_free_tier_requests`
- Daily and per-minute request limits

## Solution Implemented

### 1. Rate Limiter Utility (`src/utils/gemini-rate-limiter.js`)

A centralized rate limiting utility that provides:

- **Automatic Retry Logic**: Retries failed requests up to 3 times
- **Exponential Backoff**: Increases wait time between retries (1s, 2s, 4s, etc.)
- **Request Spacing**: Enforces minimum 2-second interval between requests
- **Smart Error Handling**: Respects retry delay suggestions from Google's API
- **Request Queuing**: Optional sequential processing of requests

### 2. Configuration

```javascript
const rateLimiter = new GeminiRateLimiter({
  maxRetries: 3,              // Number of retry attempts
  baseDelay: 1000,            // Base delay in ms (1 second)
  maxDelay: 60000,            // Maximum delay in ms (60 seconds)
  minRequestInterval: 2000    // Minimum time between requests (2 seconds)
});
```

### 3. Usage

#### Basic Usage (with retry)
```javascript
const { rateLimiter } = require('../utils/gemini-rate-limiter');

const responseText = await rateLimiter.executeWithRetry(
  async () => {
    const result = await model.generateContent(prompt);
    return result.response.text();
  },
  'PDS parsing' // Context for logging
);
```

#### Queue-based Usage (sequential processing)
```javascript
const responseText = await rateLimiter.queueRequest(
  async () => {
    const result = await model.generateContent(prompt);
    return result.response.text();
  },
  'Resume generation'
);
```

### 4. Files Updated

All Gemini API calls have been updated with rate limiting:

1. **Document Routes** (`src/routes/document.routes.js`)
   - PDS PDF processing
   - Resume/CV processing

2. **Resume Generator Service** (`src/services/resume-generator.service.js`)
   - Resume generation from PDS
   - Resume optimization for jobs

3. **Career Path Routes** (`src/routes/career-path.routes.js`)
   - Career path generation
   - Career insights generation

4. **Job Routes** (`src/routes/job.routes.js`)
   - Job matching analysis

5. **Applicant Ranking Model** (`src/models/applicantRanking.model.js`)
   - Applicant ranking analysis

## Benefits

1. **Prevents Rate Limit Errors**: Automatically handles 429 errors
2. **Improves Reliability**: Retries failed requests with smart backoff
3. **Better User Experience**: Requests succeed even during high load
4. **Centralized Control**: Single place to adjust rate limiting behavior
5. **Detailed Logging**: Clear console output for debugging

## Monitoring

The rate limiter logs all operations:
- `⏱️ Rate limiting: waiting Xms before next request`
- `⏳ Rate limit hit. Retry X/3 after Ys...`
- `✅ [Context] succeeded`
- `❌ [Context] failed after 3 retries`

## Alternative Solutions

If you continue to hit rate limits, consider:

### Option 1: Upgrade Gemini API Plan
- Move from free tier to paid plan
- Higher request limits
- Better performance

### Option 2: Switch to OpenAI
You already have an OpenAI API key configured. To switch:

```javascript
// Replace Gemini initialization
const { OpenAI } = require('openai');
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// Use Openai instead
const response = await openai.chat.completions.create({
  model: 'gpt-4',
  messages: [{ role: 'user', content: prompt }]
});
const responseText = response.choices[0].message.content;
```

### Option 3: Implement Caching
Cache AI responses for similar requests to reduce API calls.

### Option 4: Batch Processing
Process multiple documents in batches during off-peak hours.

## Testing

To test the rate limiter:

1. Upload multiple PDS documents quickly
2. Check console logs for rate limiting messages
3. Verify requests succeed after retries
4. Monitor queue status with `rateLimiter.getQueueStatus()`

## Troubleshooting

**Still getting 429 errors?**
- Increase `minRequestInterval` to 5000ms (5 seconds)
- Reduce concurrent uploads
- Consider upgrading API plan

**Requests taking too long?**
- Check if retries are happening frequently
- May need to upgrade API tier
- Consider implementing request queuing

**Need to adjust settings?**
Edit `server/src/utils/gemini-rate-limiter.js` and modify the singleton configuration.
