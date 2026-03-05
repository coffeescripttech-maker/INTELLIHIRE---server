require('dotenv').config();
const mongoose = require('mongoose');
const fs = require('fs');
const path = require('path');

// Import all models
const User = require('../models/user.model');
const Job = require('../models/job.model');
const Company = require('../models/company.model');
const Application = require('../models/application.model');
const Document = require('../models/document.model');
const JobCategory = require('../models/job-category.model');
const Analytics = require('../models/analytics.model');

async function verifyDatabase() {
  try {
    // Connect to MongoDB
    console.log('Connecting to MongoDB...');
    const conn = await mongoose.connect(process.env.MONGODB_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true
    });

    console.log('\n=== Database Connection Info ===');
    console.log(`Host: ${conn.connection.host}`);
    console.log(`Database: ${conn.connection.name}`);
    console.log(`Port: ${conn.connection.port}`);

    // List all collections
    console.log('\n=== Available Collections ===');
    const collections = await conn.connection.db.listCollections().toArray();
    console.log(collections.map(c => c.name).join('\n'));

    // Verify indexes
    console.log('\n=== Collection Indexes ===');
    for (const collection of collections) {
      const indexes = await conn.connection.db
        .collection(collection.name)
        .indexes();
      console.log(`\n${collection.name} indexes:`);
      indexes.forEach(index => {
        console.log(`- ${index.name}: ${JSON.stringify(index.key)}`);
      });
    }

    // Check model schemas
    console.log('\n=== Model Schemas ===');
    const models = {
      User: User,
      Job: Job,
      Company: Company,
      Application: Application,
      Document: Document,
      JobCategory: JobCategory,
      Analytics: Analytics
    };

    for (const [name, model] of Object.entries(models)) {
      console.log(`\n${name} Schema:`);
      console.log(JSON.stringify(model.schema.obj, null, 2));
    }

    // Verify required collections exist
    const requiredCollections = [
      'users',
      'jobs',
      'companies',
      'applications',
      'documents',
      'jobcategories',
      'analytics'
    ];

    const missingCollections = requiredCollections.filter(
      required => !collections.some(c => c.name === required)
    );

    if (missingCollections.length > 0) {
      console.log('\n=== Missing Collections ===');
      console.log('The following required collections are missing:');
      missingCollections.forEach(c => console.log(`- ${c}`));
    } else {
      console.log('\nAll required collections are present.');
    }

    // Check upload directories
    console.log('\n=== Upload Directories ===');
    const uploadDirs = ['uploads', 'uploads/documents', 'uploads/profiles'];
    for (const dir of uploadDirs) {
      const dirPath = path.join(__dirname, '../../', dir);
      if (!fs.existsSync(dirPath)) {
        fs.mkdirSync(dirPath, { recursive: true });
        console.log(`Created directory: ${dir}`);
      } else {
        console.log(`Directory exists: ${dir}`);
      }
    }

    // Close connection
    await mongoose.connection.close();
    console.log('\nDatabase verification completed successfully!');
  } catch (error) {
    console.error('Error during database verification:', error);
    process.exit(1);
  }
}

// Run verification
verifyDatabase();
