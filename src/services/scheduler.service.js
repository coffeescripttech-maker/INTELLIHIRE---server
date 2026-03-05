const cron = require('node-cron');
const jobRecommendationService = require('./job-recommendation.service');
const jobMatcher = require('./job-matcher.service');
const emailService = require('./email.service');
const Job = require('../models/job.model');
const Application = require('../models/application.model');

class SchedulerService {
  constructor() {
    this.jobs = new Map();
  }

  // Initialize all scheduled tasks
  initialize() {
    // Generate job recommendations every Monday at 9 AM
    this.scheduleJobRecommendations('0 9 * * 1');

    // Check for expiring jobs daily at midnight
    this.scheduleExpiringJobsCheck('0 0 * * *');

    // Clean up old applications weekly
    this.scheduleApplicationCleanup('0 0 * * 0');
  }

  // Schedule job recommendations
  scheduleJobRecommendations(cronExpression) {
    const job = cron.schedule(cronExpression, async () => {
      try {
        console.log('Generating job recommendations...');
        await jobRecommendationService.generateRecommendations();
        console.log('Job recommendations generated successfully');
      } catch (error) {
        console.error('Error generating job recommendations:', error);
      }
    });

    this.jobs.set('jobRecommendations', job);
  }

  // Schedule expiring jobs check
  scheduleExpiringJobsCheck(cronExpression) {
    const job = cron.schedule(cronExpression, async () => {
      try {
        console.log('Checking for expiring jobs...');
        const expiringJobs = await Job.find({
          status: 'active',
          expiryDate: {
            $gt: new Date(),
            $lt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) // Expiring in next 7 days
          }
        });

        for (const job of expiringJobs) {
          // Update job status to 'expiring'
          job.status = 'expiring';
          await job.save();

          // Notify employer
          const company = await Company.findById(job.companyId);
          if (company && company.adminId) {
            const employer = await User.findById(company.adminId);
            if (employer) {
              await emailService.sendEmail(
                employer.email,
                `Job Posting Expiring Soon: ${job.title}`,
                `
                  <h2>Job Posting Expiring Soon</h2>
                  <p>Your job posting "${job.title}" will expire in ${Math.ceil(
                  (job.expiryDate - new Date()) / (24 * 60 * 60 * 1000)
                )} days.</p>
                  <p>Click here to extend the posting: <a href="${
                    process.env.FRONTEND_URL
                  }/jobs/${job._id}/edit">Extend Job Posting</a></p>
                `
              );
            }
          }
        }
      } catch (error) {
        console.error('Error checking expiring jobs:', error);
      }
    });

    this.jobs.set('expiringJobsCheck', job);
  }

  // Schedule application cleanup
  scheduleApplicationCleanup(cronExpression) {
    const job = cron.schedule(cronExpression, async () => {
      try {
        console.log('Cleaning up old applications...');
        const sixMonthsAgo = new Date();
        sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);

        // Archive old applications
        await Application.updateMany(
          {
            status: { $in: ['rejected', 'withdrawn'] },
            updatedAt: { $lt: sixMonthsAgo }
          },
          {
            $set: { isArchived: true }
          }
        );
      } catch (error) {
        console.error('Error cleaning up applications:', error);
      }
    });

    this.jobs.set('applicationCleanup', job);
  }

  // Stop all scheduled tasks
  stopAll() {
    for (const [name, job] of this.jobs) {
      job.stop();
      console.log(`Stopped scheduled task: ${name}`);
    }
    this.jobs.clear();
  }

  // Get status of all scheduled tasks
  getStatus() {
    const status = {};
    for (const [name, job] of this.jobs) {
      status[name] = {
        running: job.getStatus() === 'scheduled',
        lastRun: job.lastDate,
        nextRun: job.nextDate
      };
    }
    return status;
  }
}

module.exports = new SchedulerService();
