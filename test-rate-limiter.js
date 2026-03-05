/**
 * Test script for Gemini Rate Limiter
 * Run with: node test-rate-limiter.js
 */

const { rateLimiter } = require('./src/utils/gemini-rate-limiter');

async function testRateLimiter() {
  console.log('🧪 Testing Gemini Rate Limiter...\n');

  // Test 1: Basic retry logic
  console.log('Test 1: Simulating successful API call');
  try {
    const result = await rateLimiter.executeWithRetry(
      async () => {
        console.log('  → Making API call...');
        await new Promise(resolve => setTimeout(resolve, 100));
        return { success: true, data: 'Test data' };
      },
      'Test API call'
    );
    console.log('  ✅ Result:', result);
  } catch (error) {
    console.error('  ❌ Error:', error.message);
  }

  console.log('\n---\n');

  // Test 2: Simulating rate limit error
  console.log('Test 2: Simulating rate limit error (429)');
  let attemptCount = 0;
  try {
    const result = await rateLimiter.executeWithRetry(
      async () => {
        attemptCount++;
        console.log(`  → Attempt ${attemptCount}`);
        
        if (attemptCount < 2) {
          // Simulate 429 error on first attempt
          const error = new Error('Rate limit exceeded');
          error.status = 429;
          error.errorDetails = [
            {
              '@type': 'type.googleapis.com/google.rpc.RetryInfo',
              retryDelay: '2s'
            }
          ];
          throw error;
        }
        
        return { success: true, data: 'Success after retry' };
      },
      'Rate limit test'
    );
    console.log('  ✅ Result:', result);
  } catch (error) {
    console.error('  ❌ Error:', error.message);
  }

  console.log('\n---\n');

  // Test 3: Request spacing
  console.log('Test 3: Testing request spacing (should wait 2s between calls)');
  const startTime = Date.now();
  
  for (let i = 1; i <= 3; i++) {
    const callStart = Date.now();
    await rateLimiter.executeWithRetry(
      async () => {
        const elapsed = ((Date.now() - startTime) / 1000).toFixed(2);
        console.log(`  → Call ${i} at ${elapsed}s`);
        return { call: i };
      },
      `Call ${i}`
    );
  }
  
  const totalTime = ((Date.now() - startTime) / 1000).toFixed(2);
  console.log(`  ✅ Total time: ${totalTime}s (should be ~4s for 3 calls with 2s spacing)`);

  console.log('\n---\n');

  // Test 4: Queue status
  console.log('Test 4: Checking queue status');
  const status = rateLimiter.getQueueStatus();
  console.log('  Queue status:', status);

  console.log('\n✅ All tests completed!');
}

// Run tests
testRateLimiter().catch(error => {
  console.error('❌ Test failed:', error);
  process.exit(1);
});
