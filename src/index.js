// mongo db connection
// username: mdexter958
// password: ZG6jgxXwd6xPedTn

require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const morgan = require('morgan');
const helmet = require('helmet');
const compression = require('compression');
const path = require('path');
const schedulerService = require('./services/scheduler.service');

// Import routes
const authRoutes = require('./routes/auth.routes');
const userRoutes = require('./routes/user.routes');
const jobRoutes = require('./routes/job.routes');
const companyRoutes = require('./routes/company.routes');
const applicationRoutes = require('./routes/application.routes');
const documentRoutes = require('./routes/document.routes');
const analyticsRoutes = require('./routes/analytics.routes');
const jobMatchingRoutes = require('./routes/job-matching.routes');
const jobCategoryRoutes = require('./routes/job-category.routes');
const careerPathRoutes = require('./routes/career-path.routes');
const bannerRoutes = require('./routes/banner.routes');
const bannerTemplateRoutes = require('./routes/bannerTemplate.routes');
const bannerCategoryRoutes = require('./routes/bannerCategory.routes');
const bannerTagRoutes = require('./routes/bannerTag.routes');
const statsRoutes = require('./routes/stats.routes');
const applicantRankingRoutes = require('./routes/applicantRanking.routes');
const messageRoutes = require('./routes/message.routes');
const conversationRoutes = require('./routes/conversation.routes');
const emailCampaignRoutes = require('./routes/emailCampaign.routes');

const fs = require('fs');
const pdf = require('pdf-parse');

const { GoogleGenerativeAI } = require('@google/generative-ai');
const { OpenAI } = require('openai');
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

const app = express();

// Middleware
app.use(cors());
app.use(helmet());
app.use(compression());
app.use(morgan('dev'));
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ extended: true, limit: "50mb" }));
//

// Serve static files
app.use('/uploads', express.static('uploads'));

// MongoDB Connection Configuration
const connectDB = async () => {
  try {
    const conn = await mongoose.connect(process.env.MONGODB_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true
    });

    console.log(`MongoDB Connected: ${conn.connection.host}`);
    console.log(`Database Name: ${conn.connection.name}`);

    // Verify connection by listing collections
    const collections = await conn.connection.db.listCollections().toArray();
    console.log(
      'Available Collections:',
      collections.map(c => c.name)
    );

    // Set up connection event handlers
    mongoose.connection.on('error', err => {
      console.error('MongoDB connection error:', err);
    });

    mongoose.connection.on('disconnected', () => {
      console.log('MongoDB disconnected');
    });

    mongoose.connection.on('reconnected', () => {
      console.log('MongoDB reconnected');
    });

    // Handle application termination
    process.on('SIGINT', async () => {
      try {
        await mongoose.connection.close();
        console.log('MongoDB connection closed through app termination');
        process.exit(0);
      } catch (err) {
        console.error('Error during MongoDB disconnection:', err);
        process.exit(1);
      }
    });

    return conn;
  } catch (error) {
    console.error('MongoDB connection error:', error);
    // Exit process with failure
    process.exit(1);
  }
};

// Initialize MongoDB connection
connectDB()
  .then(() => {
    // Initialize scheduled tasks after DB connection
    schedulerService.initialize();
  })
  .catch(err => {
    console.error('Failed to initialize application:', err);
    process.exit(1);
  });

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/jobs', jobRoutes);
app.use('/api/companies', companyRoutes);
app.use('/api/applications', applicationRoutes);
app.use('/api/documents', documentRoutes);
app.use('/api/analytics', analyticsRoutes);
app.use('/api/matching', jobMatchingRoutes);
app.use('/api/categories', jobCategoryRoutes);
app.use('/api/career-paths', careerPathRoutes);
app.use('/api/banners', bannerRoutes);
app.use('/api/banner-templates', bannerTemplateRoutes);
app.use('/api/banner-categories', bannerCategoryRoutes);
app.use('/api/banner-tags', bannerTagRoutes);
app.use('/api/stats', statsRoutes);
app.use('/api/rankings', applicantRankingRoutes);
app.use('/api/messages', messageRoutes);
app.use('/api/conversations', conversationRoutes);
app.use('/api/email-campaigns', emailCampaignRoutes);

app.get('/', (req, res) => {
  res.send('Server is running');
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({
    message: 'Something went wrong!',
    error: process.env.NODE_ENV === 'development' ? err.message : undefined
  });
});

// Start server
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});

// Handle unhandled promise rejections
process.on('unhandledRejection', err => {
  console.error('Unhandled Promise Rejection:', err);
  // Close server & exit process
  process.exit(1);
});
