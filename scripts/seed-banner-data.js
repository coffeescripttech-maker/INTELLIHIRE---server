const mongoose = require('mongoose');
require('dotenv').config();

// Import models
const BannerCategory = require('./src/models/bannerCategory.model');
const BannerTag = require('./src/models/bannerTag.model');

const sampleCategories = [
  {
    name: 'Promotional',
    description: 'Promotional banners for sales and offers',
    color: '#3B82F6',
    icon: 'tag'
  },
  {
    name: 'Announcement',
    description: 'Important announcements and news',
    color: '#10B981',
    icon: 'megaphone'
  },
  {
    name: 'Event',
    description: 'Event-related banners and notifications',
    color: '#F59E0B',
    icon: 'calendar'
  },
  {
    name: 'Feature',
    description: 'Feature highlights and new functionality',
    color: '#8B5CF6',
    icon: 'star'
  },
  {
    name: 'Warning',
    description: 'Important warnings and alerts',
    color: '#EF4444',
    icon: 'alert-triangle'
  }
];

const sampleTags = [
  {
    name: 'urgent',
    description: 'Urgent announcements',
    color: '#EF4444'
  },
  {
    name: 'new',
    description: 'New features or content',
    color: '#10B981'
  },
  {
    name: 'limited-time',
    description: 'Limited time offers',
    color: '#F59E0B'
  },
  {
    name: 'featured',
    description: 'Featured content',
    color: '#8B5CF6'
  },
  {
    name: 'maintenance',
    description: 'System maintenance notices',
    color: '#6B7280'
  },
  {
    name: 'update',
    description: 'System updates and changes',
    color: '#3B82F6'
  }
];

async function seedDatabase() {
  try {
    // Connect to MongoDB
    await mongoose.connect(
      process.env.MONGODB_URI || 'mongodb://localhost:27017/intellihire'
    );
    console.log('Connected to MongoDB');

    // Clear existing data
    await BannerCategory.deleteMany({});
    await BannerTag.deleteMany({});
    console.log('Cleared existing categories and tags');

    // Create sample categories
    const createdCategories = await BannerCategory.insertMany(sampleCategories);
    console.log(`Created ${createdCategories.length} categories`);

    // Create sample tags
    const createdTags = await BannerTag.insertMany(sampleTags);
    console.log(`Created ${createdTags.length} tags`);

    console.log('Database seeding completed successfully!');
    console.log('\nSample Categories:');
    createdCategories.forEach(cat => {
      console.log(`- ${cat.name} (${cat.color})`);
    });

    console.log('\nSample Tags:');
    createdTags.forEach(tag => {
      console.log(`- ${tag.name} (${tag.color})`);
    });
  } catch (error) {
    console.error('Error seeding database:', error);
  } finally {
    await mongoose.disconnect();
    console.log('Disconnected from MongoDB');
  }
}

// Run the seeding function
seedDatabase();
