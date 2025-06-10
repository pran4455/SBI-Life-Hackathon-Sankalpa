//this is app.js

// Core Dependencies
const express = require('express');
const bodyParser = require('body-parser');
const session = require('express-session');
const path = require('path');
const bcrypt = require('bcrypt');
const { spawn } = require('child_process');
const qrcode = require('qrcode');
const { authenticator } = require('otplib');
const crypto = require('crypto');
const fs = require('fs');
const axios = require('axios');
const { promisify } = require('util');
const exec = promisify(require('child_process').exec);
const xlsx = require('xlsx');
const { execFile } = require('child_process');
const { createProxyMiddleware } = require('http-proxy-middleware');

// Import session store
const SQLiteStore = require('connect-sqlite3')(session);

// Import utility modules
const dbSetup = require('./dbSetup');
const emailService = require('./emailService');
const { startChainlitServer } = require('./start_chatbot');
const { getGoalRecommendation } = require('./goal_gps'); // Import Goal GPS module

// Import Streamlit server starter
const { startStreamlitServer } = require('./start_streamlit');

// Fixed Python path
const pythonpath = process.env.PYTHON_PATH || 'python3'; 
const recommendationsMapping = {
  0: 'Cross-sell opportunity: Suggest savings or credit products with low fees',
  1: 'Engagement incentive: Personalized offers or loyalty points for early tenure engagement',
  2: 'General offer: Reward program or tailored financial review',
  3: 'Long-tenured customer: Recommend premium financial products or exclusive memberships',
  4: 'Mid-term tenure: Suggest insurance, fixed deposits, or personal loans with incentives',
  5: 'Premium policy offer: Investment or wealth management plans',
  6: 'Retention offer: Special cashback or reduced fees to retain the customer'
};

// Policy descriptions mapping
const specificPoliciesMapping = {
  0: ['SBI Life - Smart Bachat Plus', 'SBI Life - Smart Swadhan Supreme', 'SBI Life - Smart Platina Plus'],
  1: ['SBI Life - eShield Next', 'SBI Life - Saral Jeevan Bima', 'SBI Life - Smart Term Plus'],
  2: ['SBI Life - Smart Platina Supreme', 'SBI Life - Smart Platina Plus', 'SBI Life - Smart Bachat Gold'],
  3: ['SBI Life - Smart Elite Plus', 'SBI Life - Smart Fortune Builder', 'SBI Life - Premium Wealth Plan'],
  4: ['SBI Life - Smart Scholar Plus', 'SBI Life - Retire Smart Plus', 'SBI Life - Smart Investment Plan'],
  5: ['SBI Life - eWealth Plus', 'SBI Life - Smart Annuity Plus', 'SBI Life - Wealth Assure Premium'],
  6: ['SBI Life - Smart Platina Assure', 'SBI Life - Loyalty Rewards Plan', 'SBI Life - Retention Special']
};

const policyDescriptionsMapping = {
  "SBI Life - Smart Bachat Plus": "A savings-oriented life insurance plan with guaranteed additions and flexible premium payment options.",
  "SBI Life - Smart Swadhan Supreme": "A term insurance plan with return of premiums at policy end, ideal for financial security.",
  "SBI Life - Smart Platina Plus": "A life insurance savings plan with guaranteed returns and wealth accumulation benefits.",
  "SBI Life - eShield Next": "A pure risk premium life insurance plan with flexible coverage options and affordable premiums.",
  "SBI Life - Saral Jeevan Bima": "A standard term plan with simple and affordable protection for the entire family.",
  "SBI Life - Smart Term Plus": "Enhanced term insurance with additional riders and comprehensive coverage.",
  "SBI Life - Smart Platina Supreme": "A savings plan offering guaranteed regular income and life cover with tax benefits.",
  "SBI Life - Smart Bachat Gold": "Premium savings plan with higher returns and flexible withdrawal options.",
  "SBI Life - Smart Elite Plus": "A unit-linked insurance plan (ULIP) for high net-worth individuals with premium fund management.",
  "SBI Life - Smart Fortune Builder": "A unit-linked life insurance plan for wealth creation with multiple fund options.",
  "SBI Life - Premium Wealth Plan": "Exclusive wealth management solution for affluent customers with personalized service.",
  "SBI Life - Smart Scholar Plus": "A ULIP designed to secure your child's future education and career goals.",
  "SBI Life - Retire Smart Plus": "A unit-linked pension plan for retirement planning with flexible withdrawal options.",
  "SBI Life - Smart Investment Plan": "Balanced investment approach combining insurance and investment benefits.",
  "SBI Life - eWealth Plus": "An online ULIP with automatic asset allocation and digital portfolio management.",
  "SBI Life - Smart Annuity Plus": "An immediate annuity plan ensuring a lifelong income with guaranteed payments.",
  "SBI Life - Wealth Assure Premium": "Premium investment plan with guaranteed wealth creation and insurance coverage.",
  "SBI Life - Smart Platina Assure": "A life insurance savings product with guaranteed returns and loyalty benefits.",
  "SBI Life - Loyalty Rewards Plan": "Special plan for long-term customers with exclusive rewards and benefits.",
  "SBI Life - Retention Special": "Customized retention offer with special terms and reduced fees for valued customers."
};

// Production optimization settings
if (process.env.NODE_ENV === 'production') {
  // Optimize memory usage
  global.gc && global.gc(); // Enable garbage collection if available

  // Monitor memory usage
  const used = process.memoryUsage();
  console.log('Memory usage:');
  for (let key in used) {
      console.log(`${key}: ${Math.round(used[key] / 1024 / 1024 * 100) / 100} MB`);
  }
}

const app = express();  
// Server Configuration
const SERVER_CONFIG = {
  PORT: process.env.PORT || 10000,
  HOST: '0.0.0.0',
  CHATBOT_PORT: process.env.CHATBOT_PORT || 8001
};

// Log startup
console.log('Starting server...');
console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
console.log(`Main server port: ${SERVER_CONFIG.PORT}`);
console.log(`Main server host: ${SERVER_CONFIG.HOST}`);

// Production configuration and middleware setup
if (process.env.NODE_ENV === 'production') {
  // Disable unnecessary features in production
  app.disable('x-powered-by');
  app.set('env', 'production');
  
  // Enable compression for responses
  const compression = require('compression');
  app.use(compression());
  
  // Strict security headers
  app.use((req, res, next) => {
      res.set({
          // 'X-Frame-Options': 'SAMEORIGIN', // Temporarily commented out for testing Streamlit embedding
          'X-Content-Type-Options': 'nosniff',
          'X-XSS-Protection': '1; mode=block',
          'Strict-Transport-Security': 'max-age=31536000; includeSubDomains'
      });
      next();
  });
}

// Set up middleware
// Optimize response time and memory usage in production
if (process.env.NODE_ENV === 'production') {
  app.set('view cache', true);
  app.set('trust proxy', 1);
  app.use(express.json({ limit: '1mb' }));
  app.use(express.urlencoded({ extended: true, limit: '1mb' }));
  app.use(bodyParser.json({ limit: '1mb' }));
  app.use(bodyParser.urlencoded({ extended: true, limit: '1mb' }));
} else {
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));
  app.use(bodyParser.urlencoded({ extended: true }));
}

app.use('/static', express.static(path.join(__dirname, 'public/static')));
app.use('/icons', express.static(path.join(__dirname, 'public/icons')));
app.use(express.static(path.join(__dirname, 'public')));

// PWA specific routes
app.get('/manifest.json', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'manifest.json'));
});

app.get('/sw.js', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'sw.js'));
    res.set('Service-Worker-Allowed', '/');
});
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Session configuration with memory optimization
const sessionSecret = process.env.SESSION_SECRET || crypto.randomBytes(24).toString('hex');
app.use(session({
  secret: sessionSecret,
  resave: false,
  saveUninitialized: false, // Only create session when data is stored
  rolling: true, // Refresh session with each request
  cookie: { 
    secure: process.env.NODE_ENV === 'production',
    httpOnly: true,
    sameSite: 'strict',
    maxAge: 1 * 60 * 60 * 1000 // 1 hour instead of 24 hours to save memory
  },
  // Use SQLiteStore for production
  store: new SQLiteStore({
    db: 'sessions.db',
    table: 'sessions',
    dir: process.env.RENDER_STORAGE_PATH || '.',
    concurrentDB: true // Enable concurrent connections
  })
}));

// ========================================
// DATABASE INITIALIZATION
// ========================================

// Initialize database when server starts
try {
  dbSetup.initDB();
  console.log('Database initialized successfully');
} catch (err) {
  console.error('Failed to initialize database:', err);
}

// ========================================
// DATABASE UTILITY FUNCTIONS
// ========================================
// NEW: Function to check if user profile is completed

function isUserProfileCompleted(username) {
  return dbSetup.isProfileCompleted(username);
}

// NEW: Function to update user profile
function updateUserProfile(username, profileData) {
  return dbSetup.updateUserProfile(username, profileData);
}

function getUserByUsername(username) {
  return new Promise((resolve, reject) => {
    const db = dbSetup.getDB();
    db.get("SELECT * FROM users WHERE username = ?", [username], (err, row) => {
      db.close((closeErr) => {
        if (closeErr) console.error('Error closing database:', closeErr);
      });
      if (err) {
        reject(err);
      } else {
        resolve(row);
      }
    });
  });
}

function getUserByEmail(email) {
  return new Promise((resolve, reject) => {
    const db = dbSetup.getDB();
    db.get("SELECT * FROM users WHERE email = ?", [email], (err, row) => {
      db.close((closeErr) => {
        if (closeErr) console.error('Error closing database:', closeErr);
      });
      if (err) {
        reject(err);
      } else {
        resolve(row);
      }
    });
  });
}

function insertUser(username, password, email, totp_secret) {
  return new Promise((resolve, reject) => {
    const db = dbSetup.getDB();
    db.run(
      "INSERT INTO users (username, password, email, totp_secret) VALUES (?, ?, ?, ?)",
      [username, password, email, totp_secret],
      function(err) {
        db.close((closeErr) => {
          if (closeErr) console.error('Error closing database:', closeErr);
        });
        if (err) {
          reject(err);
        } else {
          resolve(this.lastID);
        }
      }
    );
  });
}

function updateTotpSecret(email, totp_secret) {
  return new Promise((resolve, reject) => {
    const db = dbSetup.getDB();
    db.run(
      "UPDATE users SET totp_secret = ? WHERE email = ?",
      [totp_secret, email],
      function(err) {
        db.close((closeErr) => {
          if (closeErr) console.error('Error closing database:', closeErr);
        });
        if (err) {
          reject(err);
        } else {
          resolve(this.changes);
        }
      }
    );
  });
}

// ========================================
// AUTHENTICATION MIDDLEWARE
// ========================================

function isAuthenticated(req, res, next) {
  if (req.session.username && req.session.authenticated) {
    return next();
  }
  res.redirect('/login');
}

// ========================================
// CORE ROUTES
// ========================================

// Welcome/Home page
app.get('/', (req, res) => {
  res.render('welcome');
});

// About page
app.get('/about', (req, res) => {
  res.render('about');
});

// ========================================
// AUTHENTICATION ROUTES
// ========================================

// Register routes
app.get('/register', (req, res) => {
  res.render('register', { error: null });
});

app.post('/register', async (req, res) => {
  try {
    const { username, password, email } = req.body;
    
    // Check if user already exists
    const existingUser = await getUserByUsername(username);
    const existingEmail = await getUserByEmail(email);
    
    if (existingUser) {
      return res.render('register', { error: 'Username already exists' });
    }
    
    if (existingEmail) {
      return res.render('register', { error: 'Email already exists' });
    }
    
    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);
    console.log('Registration - Password hashed with salt rounds 10, length:', hashedPassword.length);
    
    // Generate TOTP secret
    const secret = authenticator.generateSecret();
    
    // Insert user into database
    await insertUser(username, hashedPassword, email, secret);
    
    req.session.tempUsername = username;
    req.session.tempEmail = email;
    req.session.tempSecret = secret;
    
    res.redirect('/setup_totp');
    
  } catch (error) {
    console.error('Registration error:', error);
    res.render('register', { error: 'Registration failed. Please try again.' });
  }
});

// TOTP Setup routes
app.get('/setup_totp', (req, res) => {
  if (!req.session.tempUsername || !req.session.tempSecret) {
    return res.redirect('/register');
  }
  
  try {
    const username = req.session.tempUsername;  
    const secret = req.session.tempSecret;
    const issuer = 'Financial AI Hub';
    
    // Generate TOTP URI for QR code
    const totpUri = authenticator.keyuri(username, issuer, secret);
    
    // Generate QR code as data URL
    qrcode.toDataURL(totpUri, (err, qrCodeImage) => {
      if (err) {
        console.error('QR code generation error:', err);
        return res.render('setup_totp', { 
          qr_code_image: null, 
          secret: secret,
          error: 'Failed to generate QR code.',
          username: username
        });
      }
      
      res.render('setup_totp', { 
        qr_code_image: qrCodeImage.split(',')[1],
        secret: secret,
        error: null,
        username: username
      });
    });
    
  } catch (error) {
    console.error('TOTP setup error:', error);
    res.render('setup_totp', { 
      qr_code_image: null, 
      secret: req.session.tempSecret || '',
      error: 'Failed to setup TOTP.',
      username: req.session.tempUsername || ''
    });
  }
});

app.post('/setup_totp', async (req, res) => {
  try {
    const { totp } = req.body;
    
    if (!req.session.tempUsername || !req.session.tempSecret) {
      return res.redirect('/register');
    }
    
    const secret = req.session.tempSecret;
    
    // Verify the TOTP code
    const isValid = authenticator.verify({ token: totp, secret: secret });
    
    if (isValid) {
      // Clear temp session data
      delete req.session.tempUsername;
      delete req.session.tempEmail;
      delete req.session.tempSecret;
      
      // Redirect to login with success message
      res.render('login', { 
        error: null,
        success: 'Registration completed successfully! Please login with your credentials.'
      });
    } else {
      // Re-render setup page with error
      const username = req.session.tempUsername;
      const issuer = 'Financial AI Hub';
      const totpUri = authenticator.keyuri(username, issuer, secret);
      
      qrcode.toDataURL(totpUri, (err, qrCodeImage) => {
        res.render('setup_totp', { 
          qr_code_image: err ? null : qrCodeImage.split(',')[1],
          secret: secret,
          error: 'Invalid TOTP code. Please try again.',
          username: username
        });
      });
    }
    
  } catch (error) {
    console.error('TOTP setup verification error:', error);
    res.render('setup_totp', { 
      qr_code_image: null,
      secret: req.session.tempSecret || '',
      error: 'Verification failed. Please try again.',
      username: req.session.tempUsername || ''
    });
  }
});

// Login routes
app.get('/login', (req, res) => {
  res.render('login', { error: null, success: null });
});

app.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    
    console.log('Login attempt for username:', username);

    // Get user from database
    const user = await getUserByUsername(username);
    
    if (!user) {
      console.log('User not found:', username);
      return res.render('login', { error: 'Invalid username or password', success: null });
    }
    
    console.log('User found:', user.email);
    console.log('Stored password hash length:', user.password ? user.password.length : 'null');
    console.log('Input password length:', password ? password.length : 'null');
    
    // Check if password is correct
    const passwordMatch = await bcrypt.compare(password, user.password);
    console.log('Password match result:', passwordMatch);
    
    if (passwordMatch) {
      req.session.username = username;
      res.redirect('/verify_totp');
    } else {
      console.log('Password verification failed for user:', username);
      res.render('login', { error: 'Invalid username or password', success: null });
    }
  } catch (error) {
    console.error('Login error:', error);
    res.render('login', { error: 'Login failed. Please try again.', success: null });
  }
});

// TOTP verification routes
app.get('/verify_totp', (req, res) => {
  if (!req.session.username) {
    return res.redirect('/login');
  }
  res.render('verify_totp', { error: null });
});

app.post('/verify_totp', async (req, res) => {
  try {
    const { totp } = req.body;
    const username = req.session.username;

    if (!username) {
      return res.redirect('/login');
    }

    // Get user from database
    const user = await getUserByUsername(username);
    if (!user) {
      return res.redirect('/login');
    }

    // Verify TOTP
    const isValid = authenticator.verify({ token: totp, secret: user.totp_secret });
    if (isValid) {
      req.session.authenticated = true;
      
      // NEW: Check if profile is completed
      const profileCompleted = await isUserProfileCompleted(username);
      
      if (!profileCompleted) {
        // Redirect to information collection page for first-time users
        res.redirect('/information');
      } else {
        // Redirect to home for existing users
        res.redirect('/home');
      }
    } else {
      res.render('verify_totp', { error: 'Invalid TOTP code. Please try again.' });
    }
  } catch (error) {
    console.error('TOTP verification error:', error);
    res.render('verify_totp', { error: 'Verification failed. Please try again.' });
  }
});

// ========================================
// PASSWORD RESET ROUTES
// ========================================

// Forgot Password routes
app.get('/forgot-password', (req, res) => {
  res.render('forget_password', { error: null, success: null });
});

app.post('/forgot-password', async (req, res) => {
  try {
    const { email } = req.body;
    
    // Check if user exists
    const user = await getUserByEmail(email);
    if (!user) {
      return res.render('forget_password', { 
        error: 'Email address not found in our records.', 
        success: null 
      });
    }

    // Generate 6-digit OTP
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    
    // Store OTP and email in session with expiration time
    req.session.resetOtp = otp;
    req.session.resetEmail = email;
    req.session.otpExpires = Date.now() + 10 * 60 * 1000; // 10 minutes
    
    // Send OTP email
    await emailService.sendPasswordResetOTP(otp, email);
    
    res.render('forget_password', { 
      error: null, 
      success: 'OTP has been sent to your email address. Please check your inbox.' 
    });
    
  } catch (error) {
    console.error('Forgot password error:', error);
    res.render('forget_password', { 
      error: 'Failed to send OTP. Please try again.', 
      success: null 
    });
  }
});

// Reset Password routes
app.get('/reset-password', (req, res) => {
  // Check if reset session exists
  if (!req.session.resetEmail || !req.session.resetOtp) {
    console.log('No reset session found, redirecting to forgot password');
    return res.redirect('/forgot-password');
  }
  
  // Check if OTP has expired
  if (Date.now() > req.session.otpExpires) {
    console.log('OTP expired, clearing session');
    delete req.session.resetOtp;
    delete req.session.resetEmail;
    delete req.session.otpExpires;
    
    return res.redirect('/forgot-password');
  }
  
  res.render('reset_password', { 
    error: null, 
    success: null,
    email: req.session.resetEmail 
  });
});

app.post('/reset-password', async (req, res) => {
  try {
    const { otp, password: newPassword, confirmPassword } = req.body;
    
    console.log('=== RESET PASSWORD DEBUG ===');
    console.log('OTP received:', otp);
    console.log('Session email:', req.session.resetEmail);
    console.log('Session OTP:', req.session.resetOtp);
    
    // Check if reset session exists
    if (!req.session.resetEmail || !req.session.resetOtp) {
      console.log('❌ No reset session found');
      return res.render('reset_password', { 
        error: 'Invalid session. Please start the password reset process again.',
        success: null,
        email: req.session.resetEmail || ''
      });
    }
    
    // Check if OTP has expired
    if (Date.now() > req.session.otpExpires) {
      console.log('❌ OTP expired');
      delete req.session.resetOtp;
      delete req.session.resetEmail;
      delete req.session.otpExpires;
      
      return res.render('reset_password', { 
        error: 'OTP has expired. Please start the password reset process again.',
        success: null,
        email: ''
      });
    }
    
    // Verify OTP
    if (otp !== req.session.resetOtp) {
      console.log('❌ Invalid OTP - Expected:', req.session.resetOtp, 'Got:', otp);
      return res.render('reset_password', { 
        error: 'Invalid OTP. Please check your email and try again.',
        success: null,
        email: req.session.resetEmail
      });
    }
    
    console.log('✅ OTP verified successfully');
    
    // Validate password
    if (!newPassword || newPassword.length < 8) {
      console.log('❌ Password too short');
      return res.render('reset_password', { 
        error: 'Password must be at least 8 characters long.',
        success: null,
        email: req.session.resetEmail
      });
    }
    
    // Check if passwords match
    if (newPassword !== confirmPassword) {
      console.log('❌ Passwords do not match');
      return res.render('reset_password', { 
        error: 'Passwords do not match.',
        success: null,
        email: req.session.resetEmail
      });
    }
    
    console.log('✅ Password validation passed');
    
    // Hash the new password
    console.log('🔄 Hashing password...');
    const hashedPassword = await bcrypt.hash(newPassword, 10);
    console.log('✅ Password hashed successfully');
    
    // Update password in database
    console.log('🔄 Updating password in database...');
    const updated = await dbSetup.updateUserPassword(req.session.resetEmail, hashedPassword);
    console.log('✅ Database update completed, rows affected:', updated);
    
    if (updated === 0) {
      console.log('❌ No rows updated - user not found');
      return res.render('reset_password', { 
        error: 'Failed to update password. User not found.',
        success: null,
        email: req.session.resetEmail
      });
    }
    
    // Clear reset session data
    const emailForLogging = req.session.resetEmail;
    delete req.session.resetOtp;
    delete req.session.resetEmail;
    delete req.session.otpExpires;
    
    console.log('✅ Password reset completed successfully for:', emailForLogging);
    console.log('=== RESET PASSWORD DEBUG END ===');
    
    res.render('login', { 
      error: null,
      success: 'Password has been reset successfully. Please login with your new password.'
    });
    
  } catch (error) {
    console.error('❌ Reset password error:', error);
    res.render('reset_password', { 
      error: 'Failed to reset password. Please try again.',
      success: null,
      email: req.session.resetEmail || ''
    });
  }
});

// ========================================
// QR CODE ROUTES
// ========================================

app.get('/generate_qr_code', async (req, res) => {
  try {
    if (!req.session.username) {
      return res.redirect('/login');
    }

    const username = req.session.username;
    const user = await getUserByUsername(username);

    if (user) {
      const secret = user.totp_secret;
      const issuer = 'Financial AI Hub';
      const totpUri = authenticator.keyuri(username, issuer, secret);

      // Generate QR code as data URL
      const qrCodeImage = await qrcode.toDataURL(totpUri);
      
      res.render('totp_qr_code', { 
        qr_code_image: qrCodeImage.split(',')[1], 
        error: null 
      });
    } else {
      res.render('totp_qr_code', { qr_code_image: null, error: 'User not found.' });
    }
  } catch (error) {
    console.error('QR code generation error:', error);
    res.render('totp_qr_code', { qr_code_image: null, error: 'Failed to generate QR code.' });
  }
});

// ========================================
// USER INFORMATION COLLECTION ROUTES
// ========================================

// Information collection page
app.get('/information', isAuthenticated, async (req, res) => {
  try {
    const username = req.session.username;
    
    // Check if profile is already completed
    const profileCompleted = await isUserProfileCompleted(username);
    if (profileCompleted) {
      return res.redirect('/home');
    }
    
    res.render('information', { username: username });
  } catch (error) {
    console.error('Information page error:', error);
    res.redirect('/home');
  }
});

// Handle information collection
app.post('/information', isAuthenticated, async (req, res) => {
  try {
    const username = req.session.username;
    const {
      credit_score,
      geography,
      gender,
      age,
      marital_status,
      salary,
      tenure,
      balance,
      num_products,
      has_credit_card,
      is_active,
      exited
    } = req.body;
    
    // Convert boolean fields
    const profileData = {
      credit_score: parseInt(credit_score),
      geography: geography,
      gender: gender,
      age: parseInt(age),
      marital_status: marital_status,
      salary: parseFloat(salary),
      tenure: parseInt(tenure),
      balance: parseFloat(balance),
      num_products: parseInt(num_products),
      has_credit_card: has_credit_card === 'true' || has_credit_card === '1',
      is_active: is_active === 'true' || is_active === '1',
      exited: exited === 'true' || exited === '1'
    };
    
    // Update user profile
    await updateUserProfile(username, profileData);
    
    console.log(`Profile completed for user: ${username}`);
    res.redirect('/home');
    
  } catch (error) {
    console.error('Information collection error:', error);
    res.render('information', { 
      username: req.session.username,
      error: 'Failed to save information. Please try again.'
    });
  }
});

// ========================================
// MAIN DASHBOARD ROUTES
// ========================================

// Home route - Financial AI Hub Dashboard
app.get('/home', isAuthenticated, (req, res) => {
  res.render('home', { username: req.session.username });
});

// Logout route
app.get('/logout', (req, res) => {
  req.session.destroy();
  res.redirect('/login');
});

// ========================================
// FEATURE ROUTES
// ========================================

// Policy Recommendation with XAI
app.get('/policy-recommendation', isAuthenticated, (req, res) => {
  res.render('policy_recommend', { username: req.session.username });
});

// Route for policy upselling recommendations page
app.get('/policy-upselling-recommendations', isAuthenticated, (req, res) => {
  if (!req.session.userProfileData) {
    return res.redirect('/policy-recommendation');
  }
  res.render('policy_upselling_recommendations', {
    username: req.session.username,
    userProfileData: req.session.userProfileData,
    acceptedPolicy: req.session.acceptedPolicy
  });
});

// TIA - Conversational AI Bot
app.get('/tia-chatbot', isAuthenticated, (req, res) => {
  res.render('tia_chatbot', { username: req.session.username });
});

// Financial Chatbot
app.get('/financial-chatbot', isAuthenticated, (req, res) => {
  res.render('financial_chatbot', { username: req.session.username });
});

//Analytics Dashboard
app.get('/analytics-dashboard', isAuthenticated, (req, res) => {
  res.render('analytics_dashboard', {username: req.session.username });
});

// Games main page
app.get('/games', isAuthenticated, (req, res) => {   
  res.render('games', { username: req.session.username }); 
});

// Financial Simulator
app.get('/games/simulator', isAuthenticated, (req, res) => {
  res.render('simulator', { username: req.session.username });
});

// Goal GPS Game
app.get('/games/goal-gps', isAuthenticated, (req, res) => {   
  res.render('goal_gps', { username: req.session.username }); 
});

// Goal GPS API endpoint
app.post('/api/goal-gps', isAuthenticated, async (req, res) => {
  try {
    const { goal, duration, risk } = req.body;
    
    if (!goal || !duration || !risk) {
      return res.status(400).json({
        error: 'Missing required fields: goal, duration, and risk are required'
      });
    }

    const recommendation = await getGoalRecommendation(goal, duration, risk);
    res.json(recommendation);
  } catch (error) {
    console.error('Goal GPS API Error:', error);
    res.status(500).json({
      error: 'Failed to get goal recommendation',
      details: error.message
    });
  }
});

// ========================================
// POLICY RECOMMENDATION FEATURE
// ========================================

// Read Excel File for policies
function readExcelFile() {
    const filePath = path.join(__dirname, 'sbilife.xlsx');
    if (!fs.existsSync(filePath)) return [];
    const workbook = xlsx.readFile(filePath);
    const sheetName = workbook.SheetNames[0];
    return xlsx.utils.sheet_to_json(workbook.Sheets[sheetName]);
}

// Function to get user profile data for ML prediction
function getUserProfileData(username) {
  return new Promise((resolve, reject) => {
    const db = dbSetup.getDB();
    db.get(
      `SELECT credit_score, geography, gender, age, salary, tenure, balance, 
              num_products, has_credit_card, is_active, exited 
       FROM users WHERE username = ?`, 
      [username], 
      (err, row) => {
        db.close((closeErr) => {
          if (closeErr) console.error('Error closing database:', closeErr);
        });
        if (err) {
          reject(err);
        } else {
          resolve(row);
        }
      }
    );
  });
}

// Function to save user's policy selection
function saveUserPolicySelection(username, policyName) {
  return new Promise((resolve, reject) => {
    const db = dbSetup.getDB();
    db.run(
      `UPDATE users SET selected_policy = ?, updated_at = CURRENT_TIMESTAMP WHERE username = ?`,
      [policyName, username],
      function(err) {
        db.close((closeErr) => {
          if (closeErr) console.error('Error closing database:', closeErr);
        });
        if (err) {
          reject(err);
        } else {
          resolve(this.changes);
        }
      }
    );
  });
}

// Get policies data (if needed for frontend)
app.get('/api/policies', isAuthenticated, (req, res) => {
  try {
    const policies = readExcelFile();
    res.json(policies);
  } catch (error) {
    console.error('Error reading policies:', error);
    res.status(500).json({ error: "Failed to load policies" });
  }
});

// Updated /api/recommend route in app.js
app.post('/api/recommend', isAuthenticated, async (req, res) => {
  try {
    const { description } = req.body;
    const username = req.session.username;

    if (!description || !description.trim()) {
      return res.status(400).json({ error: "Description is required" });
    }

    console.log(`Making policy recommendation for user: ${username}`);
    console.log(`User description: ${description}`);

    // Get user profile data to pass to Python script
    const userProfile = await getUserProfileData(username);
    if (!userProfile) {
      return res.status(400).json({ 
        error: "User profile not found. Please complete your profile first." 
      });
    }

    // Prepare user data for Python script
    const userData = {
      description: description,
      username: username,  // Add username to the data
      credit_score: userProfile.credit_score,
      geography: userProfile.geography,
      gender: userProfile.gender,
      age: userProfile.age,
      salary: userProfile.salary,
      tenure: userProfile.tenure,
      balance: userProfile.balance,
      num_products: userProfile.num_products,
      has_credit_card: userProfile.has_credit_card ? 1 : 0,
      is_active: userProfile.is_active ? 1 : 0,
      exited: userProfile.exited ? 1 : 0
    };

    // Call Python script using spawn for better error handling
    const pythonProcess = spawn(pythonpath, [
      path.join(__dirname, 'policy_recommend.py'),
      JSON.stringify(userData),
      username  // Pass username as second argument
    ], {
      cwd: __dirname
    });

    let pythonOutput = '';
    let pythonError = '';

    pythonProcess.stdout.on('data', (data) => {
      pythonOutput += data.toString();
    });

    pythonProcess.stderr.on('data', (data) => {
      pythonError += data.toString();
    });

    pythonProcess.on('close', (code) => {
      if (code !== 0) {
        console.error('Python script error code:', code);
        console.error('Python stderr:', pythonError);
        return res.status(500).json({ 
          error: "Policy recommendation failed", 
          details: pythonError || `Python script exited with code ${code}`
        });
      }

      try {
        const cleanOutput = pythonOutput.trim();
        console.log('Python script output:', cleanOutput);
        
        if (!cleanOutput) {
          console.error('Empty Python output');
          return res.status(500).json({ error: "No output from Python script" });
        }

        const prediction = JSON.parse(cleanOutput);
        
        if (prediction.error) {
          console.error('Python script error:', prediction.error);
          return res.status(500).json({ error: prediction.error });
        }

        console.log('Policy prediction successful:', prediction);
        
        // Ensure response has consistent format
        let response = {
          success: true,
          message: "Policy recommendation generated successfully"
        };

        // Handle different response formats from Python
        if (prediction.policies && Array.isArray(prediction.policies)) {
          response.policies = prediction.policies;
        } else if (prediction.name) {
          // Single policy object - convert to array
          response.policies = [{
            name: prediction.name,
            why: prediction.why || 'No description available'
          }];
        } else {
          // Fallback - treat entire prediction as single policy
          response.policies = [prediction];
        }

        res.json(response);
        
      } catch (parseErr) {
        console.error('Error parsing Python output:', parseErr);
        console.error('Raw Python output:', pythonOutput);
        return res.status(500).json({ 
          error: "Invalid prediction format",
          details: parseErr.message
        });
      }
    });

    pythonProcess.on('error', (error) => {
      console.error('Failed to start Python process:', error);
      res.status(500).json({
        error: 'Failed to start Python script',
        details: error.message
      });
    });

  } catch (error) {
    console.error('Recommendation error:', error);
    res.status(500).json({ 
      error: "Internal server error", 
      details: error.message 
    });
  }
});

// UPDATED Handle policy acceptance - Replace your existing route
app.post('/api/accept-policy', isAuthenticated, async (req, res) => {
  try {
    const { policy } = req.body;
    const username = req.session.username;

    if (!policy) {
      return res.status(400).json({ error: "Policy name is required" });
    }

    // Save the accepted policy
    await saveUserPolicySelection(username, policy);

    // Get user profile data from database (this uses the stored data from /information page)
    const userProfile = await getUserProfileData(username);
    
    if (!userProfile) {
      return res.status(400).json({ 
        error: "User profile not found. Please complete your profile first." 
      });
    }

    console.log('User profile data retrieved for upselling:', userProfile);

    // Prepare user data for upselling prediction using the stored database values
    const userDataForPrediction = {
      CreditScore: userProfile.credit_score,
      Geography: userProfile.geography,
      Gender: userProfile.gender,
      Age: userProfile.age,
      Tenure: userProfile.tenure,
      Balance: userProfile.balance,
      NumOfProducts: userProfile.num_products,
      HasCrCard: userProfile.has_credit_card ? 1 : 0,
      IsActiveMember: userProfile.is_active ? 1 : 0,
      EstimatedSalary: userProfile.salary,
      Exited: userProfile.exited ? 1 : 0
    };

    // Store user data in session for upselling page
    req.session.userProfileData = userDataForPrediction;
    req.session.acceptedPolicy = policy;

    console.log('User data stored in session for upselling:', userDataForPrediction);

    res.json({ 
      success: true,
      message: "Policy accepted successfully! Generating personalized recommendations...", 
      redirect: "/policy-upselling-recommendations" 
    });

  } catch (error) {
    console.error('Policy acceptance error:', error);
    res.status(500).json({ 
      error: "Failed to process policy acceptance",
      details: error.message 
    });
  }
});

// Handle policy decline
app.post('/api/decline-policy', isAuthenticated, (req, res) => {
  try {
    res.json({ 
      success: true,
      message: "Policy declined. You can get new recommendations anytime." 
    });
  } catch (error) {
    console.error('Policy decline error:', error);
    res.status(500).json({ error: "Failed to process policy decline" });
  }
});

// Update your existing upselling API endpoint to use app.py logic
app.post('/api/upselling-recommendations', isAuthenticated, async (req, res) => {
  try {
    const username = req.session.username;
    const userProfileData = req.session.userProfileData;
    const acceptedPolicy = req.session.acceptedPolicy;
    
    if (!userProfileData) {
      return res.status(400).json({ error: "User profile data not found" });
    }

    console.log('Upselling prediction request for user:', username);
    console.log('User profile data:', userProfileData);
    
    // Prepare input data for Python ML model
    const inputData = {
      'CreditScore': userProfileData.CreditScore,
      'Geography': userProfileData.Geography,
      'Gender': userProfileData.Gender,
      'Age': userProfileData.Age,
      'Tenure': userProfileData.Tenure,
      'Balance': userProfileData.Balance,
      'NumOfProducts': userProfileData.NumOfProducts,
      'HasCrCard': userProfileData.HasCrCard,
      'IsActiveMember': userProfileData.IsActiveMember,
      'EstimatedSalary': userProfileData.EstimatedSalary,
      'Exited': userProfileData.Exited
    };

    console.log('Input data for prediction:', inputData);

    // Call Python ML model for actual prediction
    const pythonProcess = spawn(pythonpath, [
      path.join(__dirname, 'upsell_predictor.py'),
      JSON.stringify(inputData)
    ], {
      cwd: __dirname
    });

    let pythonOutput = '';
    let pythonError = '';

    pythonProcess.stdout.on('data', (data) => {
      pythonOutput += data.toString();
    });

    pythonProcess.stderr.on('data', (data) => {
      pythonError += data.toString();
    });

    pythonProcess.on('close', (code) => {
      if (code !== 0) {
        console.error('Python upselling script error code:', code);
        console.error('Python stderr:', pythonError);
        return res.status(500).json({ 
          error: "Upselling prediction failed", 
          details: pythonError || `Python script exited with code ${code}`
        });
      }

      try {
        const cleanOutput = pythonOutput.trim();
        console.log('Python upselling script output:', cleanOutput);
        
        if (!cleanOutput) {
          console.error('Empty Python upselling output');
          return res.status(500).json({ error: "No output from Python upselling script" });
        }

        const predictionResult = JSON.parse(cleanOutput);
        
        if (!predictionResult.success) {
          console.error('Python upselling script error:', predictionResult.error);
          return res.status(500).json({ error: predictionResult.error });
        }

        // Include accepted policy in response
        const response = {
          ...predictionResult,
          acceptedPolicy: acceptedPolicy || 'Unknown Policy'
        };
        
        console.log('Final upselling response:', response);
        res.json(response);
        
      } catch (parseErr) {
        console.error('Error parsing Python upselling output:', parseErr);
        console.error('Raw Python output:', pythonOutput);
        return res.status(500).json({ 
          error: "Invalid upselling prediction format",
          details: parseErr.message
        });
      }
    });

    pythonProcess.on('error', (error) => {
      console.error('Failed to start Python upselling process:', error);
      res.status(500).json({
        error: 'Failed to start Python upselling script',
        details: error.message
      });
    });
    
  } catch (error) {
    console.error('Upselling recommendations error:', error);
    res.status(500).json({
      error: 'Internal server error',
      details: error.message
    });
  }
});

// Save selected upselling policy
app.post('/api/select-upselling-policy', isAuthenticated, async (req, res) => {
  try {
    const { policy } = req.body;
    const username = req.session.username;

    if (!policy) {
      return res.status(400).json({ error: "Policy name is required" });
    }

    // You can save this as an additional policy or update the existing selection
    // For now, let's save it as an additional field
    const db = dbSetup.getDB();
    db.run(
      `UPDATE users SET upselling_policy = ?, updated_at = CURRENT_TIMESTAMP WHERE username = ?`,
      [policy, username],
      function(err) {
        db.close((closeErr) => {
          if (closeErr) console.error('Error closing database:', closeErr);
        });
        
        if (err) {
          console.error('Error saving upselling policy:', err);
          return res.status(500).json({ error: "Failed to save upselling policy" });
        }
        
        // Clear session data
        delete req.session.userProfileData;
        delete req.session.acceptedPolicy;
        
        res.json({ 
          success: true,
          message: "Upselling policy selected successfully!" 
        });
      }
    );

  } catch (error) {
    console.error('Upselling policy selection error:', error);
    res.status(500).json({ error: "Failed to save upselling policy selection" });
  }
});

// API endpoint to get specific policy details
app.get('/api/policy-details/:policyId', isAuthenticated, (req, res) => {
  const policyId = parseInt(req.params.policyId);
  
  const policies = specificPoliciesMapping[policyId] || [];
  const policyDetails = policies.map(policy => ({
    name: policy,
    description: policyDescriptionsMapping[policy] || 'No description available'
  }));
  
  res.json({
    success: true,
    policies: policyDetails,
    categoryId: policyId,
    categoryName: recommendationsMapping[policyId] || 'Unknown Category'
  });
});

// Health check endpoint
app.get('/healthz', (req, res) => {
  res.json({
      status: 'ok',
      timestamp: new Date().toISOString(),
      uptime: process.uptime()
  });
});

// Add proxy for Streamlit
const streamlitProxy = createProxyMiddleware({
  target: `http://localhost:${process.env.STREAMLIT_PORT || 8501}`,
  changeOrigin: true,
  ws: true,
  pathRewrite: {
    '^/dashboard/?': '',  // support both /dashboard and /dashboard/
  },
  onProxyReq: (proxyReq, req, res) => {
    console.log(`Proxying request to Streamlit: ${req.method} ${req.url}`);
    proxyReq.setHeader('Origin', req.protocol + '://' + req.get('host'));
  },
  onProxyRes: (proxyRes, req, res) => {
    console.log(`Streamlit response: ${proxyRes.statusCode} ${req.url}`);
  },
  onError: (err, req, res) => {
    console.error('Streamlit proxy error:', err);
    console.error('Request URL:', req.url);
    console.error('Request method:', req.method);
    console.error('Request headers:', req.headers);
    res.status(500).send('Error connecting to Streamlit dashboard');
  },
  logLevel: 'debug'
});

// Add proxy for chatbot
const chatbotProxy = createProxyMiddleware({
  target: `http://localhost:${process.env.CHATBOT_PORT || 8000}`,
  changeOrigin: true,
  ws: true,
  pathRewrite: {
    '^/chat/?': '',  // support both /chat and /chat/
  },
  onProxyReq: (proxyReq, req, res) => {
    console.log(`Proxying request to Chatbot: ${req.method} ${req.url}`);
    proxyReq.setHeader('Origin', req.protocol + '://' + req.get('host'));
  },
  onProxyRes: (proxyRes, req, res) => {
    console.log(`Chatbot response: ${proxyRes.statusCode} ${req.url}`);
  },
  onError: (err, req, res) => {
    console.error('Chatbot proxy error:', err);
    console.error('Request URL:', req.url);
    console.error('Request method:', req.method);
    console.error('Request headers:', req.headers);
    res.status(500).send('Error connecting to chatbot');
  },
  logLevel: 'debug'
});

// Add Streamlit proxy to Express app
app.use('/dashboard', streamlitProxy);

// Add chatbot proxy to Express app
app.use('/chat', chatbotProxy);

const server = app.listen(SERVER_CONFIG.PORT, SERVER_CONFIG.HOST, async () => {
  console.log(`Server is running on http://${SERVER_CONFIG.HOST}:${SERVER_CONFIG.PORT}`);
  console.log('Server startup complete');
  
  // Start Streamlit server
  try {
    console.log('Starting Streamlit dashboard...');
    await startStreamlitServer();
    console.log('Streamlit server started successfully');
  } catch (error) {
    console.error('Failed to start Streamlit server:', error);
  }
  
  // Log memory usage
  const used = process.memoryUsage();
  console.log('Memory usage after startup:');
  for (let key in used) {
      console.log(`${key}: ${Math.round(used[key] / 1024 / 1024 * 100) / 100} MB`);
  }
});
  server.on('error', (error) => {
    console.error('Server error:', error);
    process.exit(1);
});

  // Start the Flask chatbot server

  // Handle graceful shutdown
  process.on('SIGTERM', () => {
      console.log('SIGTERM received, shutting down gracefully');
      server.close(() => {
          console.log('Server closed');
          process.exit(0);
      });
});

process.on('SIGINT', () => {
    console.log('SIGINT received, shutting down gracefully');
    server.close(() => {
        console.log('Server closed');
        process.exit(0);
    });
});
const spawnPythonProcess = (scriptPath, args = []) => {
  try {
    // Add memory limit for Python processes
    const options = {
      cwd: __dirname,
      env: {
        ...process.env,
        PYTHONPATH: __dirname,
        MALLOC_TRIM_THRESHOLD_: '65536', // Enable memory trimming
        PYTHONUNBUFFERED: '1', // Disable output buffering
        PYTHONMALLOC: 'malloc', // Use system malloc
        PYTHONOPTIMIZE: '2', // Enable Python optimization (removes assertions and docstrings)
        PYTHONDONTWRITEBYTECODE: '1', // Don't write .pyc files
        MPLBACKEND: 'Agg' // Use non-interactive matplotlib backend
      }
    };

    const pythonProcess = spawn(
      process.env.PYTHON_PATH || 'python3',
      ['-OO', scriptPath, ...args], // -OO removes docstrings and assertions
      options
    );

    pythonProcess.on('error', (err) => {
      console.error(`Failed to start Python process for ${scriptPath}:`, err);
      throw err;
    });

    // Clean up process on exit
    pythonProcess.on('exit', (code) => {
      if (code !== 0) {
        console.error(`Python process exited with code ${code}`);
      }
      // Force garbage collection if available
      global.gc && global.gc();
    });

    return pythonProcess;
  } catch (error) {
    console.error(`Error spawning Python process for ${scriptPath}:`, error);
    throw error;
  }
};
