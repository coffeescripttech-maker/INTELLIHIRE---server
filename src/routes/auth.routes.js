const express = require('express');
const router = express.Router();
const { body, validationResult } = require('express-validator');
const jwt = require('jsonwebtoken');
const User = require('../models/user.model');
const emailService = require('../services/email.service');

// Middleware for validation
const validate = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }
  next();
};

// Register new user
router.post(
  '/register',

  async (req, res) => {
    try {
      const {
        email,
        password,
        role,
        firstName,
        lastName,
        phone,
        address,
        gender,
        dob
      } = req.body;

      // Check if user already exists
      const existingUser = await User.findOne({ email });
      if (existingUser) {
        return res.status(400).json({ message: 'User already exists' });
      }

      // Generate email verification token
      const verificationToken = jwt.sign(
        { userId: email, email },
        process.env.JWT_SECRET || 'your-secret-key',
        { expiresIn: '24h' }
      );

      // Create new user
      const user = new User({
        email,
        password,
        role,
        firstName,
        lastName,
        phoneNumber: phone,
        address: { street: address },
        gender,
        dob: dob ? new Date(dob) : undefined,
        isVerified: false,
        emailVerificationToken: verificationToken,
        emailVerificationExpires: new Date(Date.now() + 24 * 60 * 60 * 1000) // 24 hours
      });

      await user.save();

      // Send verification email
      const baseUrl = process.env.CLIENT_URL || 'http://localhost:3000';
      await emailService.sendEmailVerification(
        email,
        firstName,
        verificationToken,
        baseUrl
      );

      res.status(201).json({
        message:
          'Registration successful! Please check your email to verify your account.',
        requiresVerification: true,
        user: {
          id: user._id,
          email: user.email,
          role: user.role,
          firstName: user.firstName,
          lastName: user.lastName,
          isVerified: false
        }
      });
    } catch (error) {
      res
        .status(500)
        .json({ message: 'Error registering user', error: error.message });
    }
  }
);

// Verify email
router.get('/verify-email/:token', async (req, res) => {
  try {
    const { token } = req.params;

    // Verify token
    const decoded = jwt.verify(
      token,
      process.env.JWT_SECRET || 'your-secret-key'
    );

    // Find user
    const user = await User.findOne({ email: decoded.email });
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // Check if already verified
    if (user.isVerified) {
      return res.json({
        success: true,
        message: 'Email already verified',
        alreadyVerified: true
      });
    }

    // Check if token matches and not expired
    if (user.emailVerificationToken !== token) {
      return res.status(400).json({
        success: false,
        message: 'Invalid verification token'
      });
    }

    if (user.emailVerificationExpires < new Date()) {
      return res.status(400).json({
        success: false,
        message: 'Verification token has expired',
        expired: true
      });
    }

    // Verify user
    user.isVerified = true;
    user.emailVerificationToken = undefined;
    user.emailVerificationExpires = undefined;
    await user.save();

    res.json({
      success: true,
      message: 'Email verified successfully! You can now log in.',
      user: {
        id: user._id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        role: user.role,
        isVerified: true
      }
    });
  } catch (error) {
    if (
      error.name === 'JsonWebTokenError' ||
      error.name === 'TokenExpiredError'
    ) {
      return res.status(400).json({
        success: false,
        message: 'Invalid or expired verification token',
        expired: true
      });
    }
    res.status(500).json({
      success: false,
      message: 'Error verifying email',
      error: error.message
    });
  }
});

// Resend verification email
router.post('/resend-verification', async (req, res) => {
  try {
    const { email } = req.body;

    const user = await User.findOne({ email });
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    if (user.isVerified) {
      return res.status(400).json({ message: 'Email already verified' });
    }

    // Generate new verification token
    const verificationToken = jwt.sign(
      { userId: user._id, email: user.email },
      process.env.JWT_SECRET || 'your-secret-key',
      { expiresIn: '24h' }
    );

    user.emailVerificationToken = verificationToken;
    user.emailVerificationExpires = new Date(Date.now() + 24 * 60 * 60 * 1000);
    await user.save();

    // Send verification email
    const baseUrl = process.env.CLIENT_URL || 'http://localhost:3000';
    await emailService.sendEmailVerification(
      email,
      user.firstName,
      verificationToken,
      baseUrl
    );

    res.json({
      success: true,
      message: 'Verification email sent successfully'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error resending verification email',
      error: error.message
    });
  }
});

// Login user
router.post(
  '/login',
  [
    body('email').isEmail().normalizeEmail(),
    body('password').exists(),
    validate
  ],
  async (req, res) => {
    try {
      const { email, password } = req.body;

      console.log({ email, password });

      // Find user
      const user = await User.findOne({ email });
      if (!user) {
        return res.status(401).json({ message: 'Invalid credentials' });
      }

      // Check password
      const isMatch = await user.comparePassword(password);
      if (!isMatch) {
        return res.status(401).json({ message: 'Invalid credentials' });
      }

      // Check if email is verified
      if (!user.isVerified) {
        return res.status(403).json({
          message:
            'Please verify your email address before logging in. Check your inbox for the verification link.',
          requiresVerification: true,
          email: user.email
        });
      }

      // Update last login
      user.lastLogin = new Date();
      await user.save();

      // Generate JWT token
      const token = jwt.sign(
        { userId: user._id, role: user.role },
        process.env.JWT_SECRET || 'your-secret-key',
        { expiresIn: '24h' }
      );

      res.json({
        message: 'Login successful',
        token,
        user: {
          id: user._id,
          email: user.email,
          role: user.role,
          firstName: user.firstName,
          lastName: user.lastName
        }
      });
    } catch (error) {
      res
        .status(500)
        .json({ message: 'Error logging in', error: error.message });
    }
  }
);

// Forgot password
router.post(
  '/forgot-password',
  [body('email').isEmail().normalizeEmail(), validate],
  async (req, res) => {
    try {
      const { email } = req.body;

      // Find user
      const user = await User.findOne({ email });
      if (!user) {
        return res
          .status(404)
          .json({ message: 'User not found with this email address' });
      }

      // Generate reset token
      const resetToken = jwt.sign(
        { userId: user._id, email: user.email },
        process.env.JWT_SECRET || 'your-secret-key',
        { expiresIn: '1h' }
      );

      // Send password reset email
      const emailResult = await emailService.sendPasswordReset(
        email,
        resetToken
      );

      if (!emailResult.success) {
        return res.status(500).json({
          message: 'Failed to send reset email',
          error: emailResult.error
        });
      }

      res.json({
        message: 'Password reset email sent successfully',
        // In development, include the token for testing
        ...(process.env.NODE_ENV === 'development' && { resetToken })
      });
    } catch (error) {
      res.status(500).json({
        message: 'Error processing forgot password request',
        error: error.message
      });
    }
  }
);

// Reset password
router.post(
  '/reset-password',
  [body('token').notEmpty(), body('password').isLength({ min: 6 }), validate],
  async (req, res) => {
    try {
      const { token, password } = req.body;

      // Verify token
      const decoded = jwt.verify(
        token,
        process.env.JWT_SECRET || 'your-secret-key'
      );

      // Find user
      const user = await User.findById(decoded.userId);
      if (!user) {
        return res
          .status(404)
          .json({ message: 'Invalid or expired reset token' });
      }

      // Update password
      user.password = password;
      await user.save();

      res.json({
        message: 'Password reset successfully'
      });
    } catch (error) {
      if (
        error.name === 'JsonWebTokenError' ||
        error.name === 'TokenExpiredError'
      ) {
        return res
          .status(400)
          .json({ message: 'Invalid or expired reset token' });
      }
      res
        .status(500)
        .json({ message: 'Error resetting password', error: error.message });
    }
  }
);

module.exports = router;
