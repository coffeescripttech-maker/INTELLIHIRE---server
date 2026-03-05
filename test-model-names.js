/**
 * Test different Gemini model names to find which one works
 */

require('dotenv').config();
const { GoogleGenerativeAI } = require('@google/generative-ai');

const MODEL_NAMES_TO_TEST = [
  'gemini-pro',
  'gemini-1.5-pro',
  'gemini-1.5-flash',
  'gemini-1.5-pro-latest',
  'gemini-1.5-flash-latest',
  'gemini-1.5-pro-002',
  'gemini-1.5-flash-002',
  'gemini-2.0-flash-exp',
  'gemini-flash',
  'gemini-pro-vision',
  'models/gemini-pro',
  'models/gemini-1.5-flash',
];

async function testModelName(modelName) {
  try {
    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
    const model = genAI.getGenerativeModel({ model: modelName });
    
    // Try a simple test prompt
    const result = await model.generateContent('Say "test successful" if you can read this.');
    const response = await result.response;
    const text = response.text();
    
    return { success: true, response: text };
  } catch (error) {
    return { success: false, error: error.message, status: error.status };
  }
}

async function findWorkingModel() {
  console.log('🔍 Testing Gemini model names...\n');
  console.log('API Key:', process.env.GEMINI_API_KEY ? '✅ Found' : '❌ NOT FOUND');
  console.log('='.repeat(80));
  
  const results = [];
  
  for (const modelName of MODEL_NAMES_TO_TEST) {
    process.stdout.write(`\nTesting: ${modelName.padEnd(30)} ... `);
    
    const result = await testModelName(modelName);
    
    if (result.success) {
      console.log('✅ WORKS!');
      console.log(`   Response: ${result.response.substring(0, 50)}...`);
      results.push({ model: modelName, status: 'working' });
    } else {
      if (result.status === 404) {
        console.log('❌ Not Found (404)');
      } else if (result.status === 429) {
        console.log('⚠️  Rate Limited (429) - Model exists but quota exceeded');
        results.push({ model: modelName, status: 'rate-limited' });
      } else {
        console.log(`❌ Error: ${result.error.substring(0, 50)}...`);
      }
    }
    
    // Small delay to avoid rate limiting
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  
  console.log('\n' + '='.repeat(80));
  console.log('\n📊 Summary:\n');
  
  const working = results.filter(r => r.status === 'working');
  const rateLimited = results.filter(r => r.status === 'rate-limited');
  
  if (working.length > 0) {
    console.log('✅ Working models:');
    working.forEach(r => console.log(`   - ${r.model}`));
    console.log(`\n💡 Use this in your code: model: '${working[0].model}'`);
  } else if (rateLimited.length > 0) {
    console.log('⚠️  Models exist but rate limited:');
    rateLimited.forEach(r => console.log(`   - ${r.model}`));
    console.log('\n💡 These models exist! Wait a bit and try again, or use one of these.');
  } else {
    console.log('❌ No working models found');
    console.log('\n💡 Possible issues:');
    console.log('   1. API key might be invalid');
    console.log('   2. All models are rate limited');
    console.log('   3. API access might be restricted');
    console.log('\n   Check: https://aistudio.google.com/app/apikey');
  }
}

findWorkingModel().catch(error => {
  console.error('\n❌ Fatal error:', error);
  process.exit(1);
});
