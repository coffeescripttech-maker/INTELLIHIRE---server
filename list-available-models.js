/**
 * List all available Gemini models for your API key
 */

require('dotenv').config();
const { GoogleGenerativeAI } = require('@google/generative-ai');

async function listAvailableModels() {
  try {
    console.log('🔑 Using API Key:', process.env.GEMINI_API_KEY ? 'Found' : 'NOT FOUND');
    
    if (!process.env.GEMINI_API_KEY) {
      console.error('❌ GEMINI_API_KEY not found in .env file');
      process.exit(1);
    }

    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
    
    console.log('\n📋 Fetching available models...\n');
    
    // Try to list models
    const models = await genAI.listModels();
    
    console.log('✅ Available Models:\n');
    console.log('=' .repeat(80));
    
    models.forEach((model, index) => {
      console.log(`\n${index + 1}. Model: ${model.name}`);
      console.log(`   Display Name: ${model.displayName || 'N/A'}`);
      console.log(`   Description: ${model.description || 'N/A'}`);
      console.log(`   Supported Methods: ${model.supportedGenerationMethods?.join(', ') || 'N/A'}`);
      console.log(`   Input Token Limit: ${model.inputTokenLimit || 'N/A'}`);
      console.log(`   Output Token Limit: ${model.outputTokenLimit || 'N/A'}`);
    });
    
    console.log('\n' + '='.repeat(80));
    console.log(`\n✅ Total models available: ${models.length}`);
    
    // Find models that support generateContent
    const contentModels = models.filter(m => 
      m.supportedGenerationMethods?.includes('generateContent')
    );
    
    console.log(`\n📝 Models supporting generateContent: ${contentModels.length}`);
    contentModels.forEach(m => {
      console.log(`   - ${m.name}`);
    });
    
    // Suggest best model for your use case
    console.log('\n💡 Recommended models for PDS parsing:');
    const recommended = contentModels.filter(m => 
      m.name.includes('flash') || m.name.includes('pro')
    );
    
    if (recommended.length > 0) {
      recommended.forEach(m => {
        console.log(`   ✅ ${m.name} - ${m.displayName}`);
      });
    } else {
      console.log('   Use any model from the list above that supports generateContent');
    }
    
  } catch (error) {
    console.error('\n❌ Error listing models:', error.message);
    console.error('\nFull error:', error);
    
    if (error.status === 400) {
      console.log('\n💡 Tip: Your API key might be invalid or expired');
      console.log('   Check: https://aistudio.google.com/app/apikey');
    }
  }
}

listAvailableModels();
