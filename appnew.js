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

// Socket.IO Dependencies
const http = require('http');
const socketIo = require('socket.io');
const uuid = require('uuid');

// Import utility modules
const dbSetup = require('./dbSetup');
const emailService = require('./emailService');
const { startChainlitServer } = require('./start_chatbot');
const { startStreamlitServer } = require('./start_streamlit');
const { getGoalRecommendation } = require('./goal_gps'); // Import Goal GPS module
const CustomerStore = require('./customerStore.js');
const MessageRouter = require('./messageRouter.js');

// Fixed Python path
const pythonpath = "C:/Users/prana/anaconda3/envs/tds/python.exe"; 

const app = express();
const server = http.createServer(app);
const io = socketIo(server);
const PORT = 3000;

// ========================================
// MIDDLEWARE SETUP
// ========================================

// Set up middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(bodyParser.urlencoded({ extended: true }));
app.use('/static', express.static(path.join(__dirname, 'public/static')));
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Session configuration
const sessionSecret = crypto.randomBytes(24).toString('hex');
app.use(session({
  secret: sessionSecret,
  resave: false,
  saveUninitialized: true,
  cookie: { secure: false }
}));

// ========================================
// AUTHENTICATION MIDDLEWARE
// ========================================

function requireAuth(req, res, next) {
  if (!req.session.username || !req.session.authenticated) {
    return res.redirect('/login');
  }
  next();
}

function requireRole(role) {
  return (req, res, next) => {
    if (!req.session.username || !req.session.authenticated) {
      return res.redirect('/login');
    }
    
    if (req.session.userRole !== role) {
      return res.status(403).render('error', { 
        error: 'Access denied. Insufficient permissions.',
        message: `This page is only accessible to ${role}s.`
      });
    }
    
    next();
  };
}

// ========================================
// DATABASE INITIALIZATION
// ========================================

try {
  dbSetup.initDB();
  console.log('Database initialized successfully');
} catch (err) {
  console.error('Failed to initialize database:', err);
}

// ========================================
// DATABASE UTILITY FUNCTIONS
// ========================================

function isUserProfileCompleted(username) {
  return dbSetup.isProfileCompleted(username);
}

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

function insertUser(username, password, email, totp_secret, role = 'customer') {
  return new Promise((resolve, reject) => {
    const db = dbSetup.getDB();
    db.run(
      "INSERT INTO users (username, password, email, totp_secret, role) VALUES (?, ?, ?, ?, ?)",
      [username, password, email, totp_secret, role],
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

// ========================================
// CORE ROUTES
// ========================================

app.get('/', (req, res) => {
  res.render('welcome');
});

app.get('/about', (req, res) => {
  res.render('about');
});

// ========================================
// AUTHENTICATION ROUTES
// ========================================

// Register routes - Fixed parameter syntax
app.get('/register', (req, res) => {
  res.render('register', { error: null, role: 'customer' });
});

app.get('/register/customer', (req, res) => {
  res.render('register', { error: null, role: 'customer' });
});

app.get('/register/agent', (req, res) => {
  res.render('register', { error: null, role: 'agent' });
});

app.post('/register', async (req, res) => {
  await handleRegistration(req, res, 'customer');
});

app.post('/register/customer', async (req, res) => {
  await handleRegistration(req, res, 'customer');
});

app.post('/register/agent', async (req, res) => {
  await handleRegistration(req, res, 'agent');
});

async function handleRegistration(req, res, role) {
  try {
    const { username, password, email } = req.body;
    
    // Check if user already exists
    const existingUser = await getUserByUsername(username);
    const existingEmail = await getUserByEmail(email);
    
    if (existingUser) {
      return res.render('register', { error: 'Username already exists', role: role });
    }
    
    if (existingEmail) {
      return res.render('register', { error: 'Email already exists', role: role });
    }
    
    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);
    
    // Generate TOTP secret
    const secret = authenticator.generateSecret();
    
    // Insert user into database with role
    await insertUser(username, hashedPassword, email, secret, role);
    
    req.session.tempUsername = username;
    req.session.tempEmail = email;
    req.session.tempSecret = secret;
    req.session.tempRole = role;
    
    res.redirect('/setup_totp');
    
  } catch (error) {
    console.error('Registration error:', error);
    res.render('register', { error: 'Registration failed. Please try again.', role: role });
  }
}

// TOTP Setup routes
app.get('/setup_totp', (req, res) => {
  if (!req.session.tempUsername || !req.session.tempSecret) {
    return res.redirect('/register');
  }
  
  try {
    const username = req.session.tempUsername;  
    const secret = req.session.tempSecret;
    const issuer = 'Financial AI Hub';
    
    const totpUri = authenticator.keyuri(username, issuer, secret);
    
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
    const isValid = authenticator.verify({ token: totp, secret: secret });
    
    if (isValid) {
      delete req.session.tempUsername;
      delete req.session.tempEmail;
      delete req.session.tempSecret;
      
      res.render('login', { 
        error: null,
        success: 'Registration completed successfully! Please login with your credentials.',
        role: 'customer'
      });
    } else {
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

// Login routes - Fixed parameter syntax
app.get('/login', (req, res) => {
  res.render('login', { error: null, role: 'customer' });
});

app.get('/login/customer', (req, res) => {
  res.render('login', { error: null, role: 'customer' });
});

app.get('/login/agent', (req, res) => {
  res.render('login', { error: null, role: 'agent' });
});

app.post('/login', async (req, res) => {
  await handleLogin(req, res, 'customer');
});

app.post('/login/customer', async (req, res) => {
  await handleLogin(req, res, 'customer');
});

app.post('/login/agent', async (req, res) => {
  await handleLogin(req, res, 'agent');
});

async function handleLogin(req, res, expectedRole) {
  try {
    const { username, password } = req.body;
    
    const user = await getUserByUsername(username);
    
    if (!user) {
      return res.render('login', { error: 'Invalid username or password', role: expectedRole });
    }
    
    if (user.role !== expectedRole) {
      return res.render('login', { 
        error: `This login is for ${expectedRole}s only. Please use the correct login page.`, 
        role: expectedRole 
      });
    }
    
    const passwordMatch = await bcrypt.compare(password, user.password);
    
    if (passwordMatch) {
      req.session.username = username;
      req.session.userRole = user.role;
      res.redirect('/verify_totp');
    } else {
      res.render('login', { error: 'Invalid username or password', role: expectedRole });
    }
  } catch (error) {
    console.error('Login error:', error);
    res.render('login', { error: 'Login failed. Please try again.', role: expectedRole });
  }
}

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

    const user = await getUserByUsername(username);
    if (!user) {
      return res.redirect('/login');
    }

    const isValid = authenticator.verify({ token: totp, secret: user.totp_secret });
    if (isValid) {
      req.session.authenticated = true;
      req.session.userRole = user.role;
      
      if (user.role === 'agent') {
        res.redirect('/dashboard/agent');
      } else {
        const profileCompleted = await isUserProfileCompleted(username);
        
        if (!profileCompleted) {
          res.redirect('/information');
        } else {
          res.redirect('/dashboard/customer');
        }
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

app.get('/forgot-password', (req, res) => {
  res.render('forget_password', { error: null, success: null });
});

app.post('/forgot-password', async (req, res) => {
  try {
    const { email } = req.body;
    
    const user = await getUserByEmail(email);
    if (!user) {
      return res.render('forget_password', { 
        error: 'Email address not found in our records.', 
        success: null 
      });
    }

    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    
    req.session.resetOtp = otp;
    req.session.resetEmail = email;
    req.session.otpExpires = Date.now() + 10 * 60 * 1000;
    
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

app.get('/reset-password', (req, res) => {
  if (!req.session.resetEmail || !req.session.resetOtp) {
    return res.redirect('/forgot-password');
  }
  
  if (Date.now() > req.session.otpExpires) {
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
    
    if (!req.session.resetEmail || !req.session.resetOtp) {
      return res.render('reset_password', { 
        error: 'Invalid session. Please start the password reset process again.',
        success: null,
        email: req.session.resetEmail || ''
      });
    }
    
    if (Date.now() > req.session.otpExpires) {
      delete req.session.resetOtp;
      delete req.session.resetEmail;
      delete req.session.otpExpires;
      
      return res.render('reset_password', { 
        error: 'OTP has expired. Please start the password reset process again.',
        success: null,
        email: ''
      });
    }
    
    if (otp !== req.session.resetOtp) {
      return res.render('reset_password', { 
        error: 'Invalid OTP. Please check your email and try again.',
        success: null,
        email: req.session.resetEmail
      });
    }
    
    if (!newPassword || newPassword.length < 8) {
      return res.render('reset_password', { 
        error: 'Password must be at least 8 characters long.',
        success: null,
        email: req.session.resetEmail
      });
    }
    
    if (newPassword !== confirmPassword) {
      return res.render('reset_password', { 
        error: 'Passwords do not match.',
        success: null,
        email: req.session.resetEmail
      });
    }
    
    const hashedPassword = await bcrypt.hash(newPassword, 10);
    const updated = await dbSetup.updateUserPassword(req.session.resetEmail, hashedPassword);
    
    if (updated === 0) {
      return res.render('reset_password', { 
        error: 'Failed to update password. User not found.',
        success: null,
        email: req.session.resetEmail
      });
    }
    
    delete req.session.resetOtp;
    delete req.session.resetEmail;
    delete req.session.otpExpires;
    
    res.render('login', { 
      error: null,
      success: 'Password has been reset successfully. Please login with your new password.',
      role: 'customer'
    });
    
  } catch (error) {
    console.error('Reset password error:', error);
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

app.get('/information', requireAuth, async (req, res) => {
  try {
    const username = req.session.username;
    
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

app.post('/information', requireAuth, async (req, res) => {
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
// ROLE-BASED DASHBOARD ROUTES
// ========================================

app.get('/dashboard/customer', requireRole('customer'), async (req, res) => {
  try {
    const user = await getUserByUsername(req.session.username);
    res.render('dashboard_customer', { 
      user: user,
      username: req.session.username 
    });
  } catch (error) {
    console.error('Customer dashboard error:', error);
    res.render('error', { error: 'Failed to load dashboard' });
  }
});

app.get('/dashboard/agent', requireRole('agent'), async (req, res) => {
  try {
    const user = await getUserByUsername(req.session.username);
    res.render('dashboard_agent', { 
      user: user,
      username: req.session.username 
    });
  } catch (error) {
    console.error('Agent dashboard error:', error);
    res.render('error', { error: 'Failed to load dashboard' });
  }
});

// ========================================
// LEGACY ROUTES
// ========================================

app.get('/home', requireAuth, async (req, res) => {
  const userRole = req.session.userRole;
  if (userRole === 'agent') {
    res.redirect('/dashboard/agent');
  } else {
    res.redirect('/dashboard/customer');
  }
});

app.get('/logout', (req, res) => {
  req.session.destroy((err) => {
    if (err) {
      console.error('Logout error:', err);
    }
    res.redirect('/');
  });
});

// ========================================
// FEATURE ROUTES
// ========================================

app.get('/policy-recommendation', requireAuth, (req, res) => {
  res.render('policy_recommend', { username: req.session.username });
});

app.get('/policy-upselling-recommendations', requireAuth, (req, res) => {
  if (!req.session.userProfileData) {
    return res.redirect('/policy-recommend');
  }
  res.render('policy_upselling_recommendations');
});

app.get('/tia-chatbot', requireAuth, (req, res) => {
  res.render('tia_customer', { username: req.session.username });
});

app.get('/tia-operator', requireAuth, (req, res) => {
  res.render('tia_operator', { username: req.session.username });
});

app.get('/financial-chatbot', requireAuth, (req, res) => {
  res.render('financial_chatbot', { username: req.session.username });
});

app.get('/analytics-dashboard', requireAuth, (req, res) => {
  res.render('analytics_dashboard', {username: req.session.username });
});

app.get('/games', requireAuth, (req, res) => {   
  res.render('games', { username: req.session.username }); 
});

app.get('/games/simulator', requireAuth, (req, res) => {
  res.render('simulator', { username: req.session.username });
});

app.get('/games/goal-gps', requireAuth, (req, res) => {   
  res.render('goal_gps', { username: req.session.username }); 
});

// ========================================
// ERROR HANDLING
// ========================================

app.get('/error', (req, res) => {
  res.render('error', { 
    error: 'An error occurred', 
    message: 'Please try again later.' 
  });
});

// Goal GPS API endpoint
app.post('/api/goal-gps', requireAuth, async (req, res) => {
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
// TIA CHAT SETUP
// ========================================

// Set environment variables directly
process.env.DF_SERVICE_ACCOUNT_PATH = 'credentials.json';
process.env.GOOGLE_APPLICATION_CREDENTIALS = 'credentials.json';
process.env.DF_PROJECT_ID = 'sbi-talksmart-foel';

const keyPath = process.env.DF_SERVICE_ACCOUNT_PATH;
if (!keyPath || !fs.existsSync(keyPath)) {
    console.log('Credentials file not found at:', keyPath);
    console.log('Make sure credentials.json exists in the project directory');
    process.exit(1);
}

// Imports the Dialogflow client library
const dialogflow = require('@google-cloud/dialogflow').v2beta1;

// Instantiate a DialogFlow client.
const dialogflowClient = new dialogflow.SessionsClient({
    keyFilename: keyPath
});

// A unique identifier for the given session
const sessionId = uuid.v4();

// Grab the Dialogflow project ID from environment variable
const projectId = process.env.DF_PROJECT_ID;
if (!projectId) {
    console.log('Project ID not set');
    process.exit(1);
}

const sessionPath = dialogflowClient.projectAgentSessionPath(
    projectId,
    sessionId
);

// ========================================
// SOCKET.IO NAMESPACES SETUP
// ========================================

// Create Socket.IO namespaces
const customerNamespace = io.of('/tia_customer');
const operatorNamespace = io.of('/tia_operator');

// Instantiate TIA chat components
const customerStore = new CustomerStore();
const messageRouter = new MessageRouter({
    customerStore: customerStore,
    dialogflowClient: dialogflowClient,
    projectId: projectId,
    sessionPath: sessionPath,
    customerRoom: customerNamespace,
    operatorRoom: operatorNamespace
}); 

// Begin responding to websocket and http requests for TIA
messageRouter.handleConnections();

// Recommendations mapping based on model classes - For Upselling Policy
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

// ========================================
// POLICY RECOMMENDATION FEATURE
// ========================================

// Read Excel File for policies
function readExcelFile() {
    const filePath = 'sbilife.xlsx';
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
app.get('/api/policies', requireAuth, (req, res) => {
  try {
    const policies = readExcelFile();
    res.json(policies);
  } catch (error) {
    console.error('Error reading policies:', error);
    res.status(500).json({ error: "Failed to load policies" });
  }
});

// Updated /api/recommend route in app.js with enhanced debugging
app.post('/api/recommend', requireAuth, async (req, res) => {
  try {
    const { description } = req.body;
    const username = req.session.username;

    if (!description || !description.trim()) {
      return res.status(400).json({ error: "Description is required" });
    }

    console.log(`=== POLICY RECOMMENDATION DEBUG START ===`);
    console.log(`Making policy recommendation for user: ${username}`);
    console.log(`User description: ${description}`);

    // Get user profile data to pass to Python script
    const userProfile = await getUserProfileData(username);
    if (!userProfile) {
      console.error(`❌ User profile not found for: ${username}`);
      return res.status(400).json({ 
        error: "User profile not found. Please complete your profile first." 
      });
    }

    console.log(`✅ User profile retrieved:`, userProfile);

    // Prepare user data for Python script
    const userData = {
      description: description,
      username: username,
      credit_score: userProfile.credit_score || 650,
      geography: userProfile.geography || 'Unknown',
      gender: userProfile.gender || 'Unknown',
      age: userProfile.age || 35,
      marital_status: userProfile.marital_status || 'Single',
      salary: userProfile.salary || 50000,
      tenure: userProfile.tenure || 2,
      balance: userProfile.balance || 100000,
      num_products: userProfile.num_products || 1,
      has_credit_card: userProfile.has_credit_card ? 1 : 0,
      is_active: userProfile.is_active ? 1 : 0,
      exited: userProfile.exited ? 1 : 0
    };

    console.log(`📋 Prepared user data for Python:`, userData);

    // Call Python script for policy recommendation
    console.log(`🐍 Starting Python policy recommendation script...`);
    const pythonProcess = spawn(pythonpath, [
      path.join(__dirname, 'policy_recommend.py'),
      JSON.stringify(userData),
      username
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
      console.log(`🐍 Python stderr:`, data.toString());
    });

    pythonProcess.on('close', async (code) => {
      console.log(`🐍 Python script finished with code: ${code}`);
      
      if (code !== 0) {
        console.error('❌ Python script error code:', code);
        console.error('❌ Python stderr:', pythonError);
        return res.status(500).json({ 
          error: "Policy recommendation failed", 
          details: pythonError || `Python script exited with code ${code}`
        });
      }

      try {
        const cleanOutput = pythonOutput.trim();
        console.log('✅ Python script raw output:', cleanOutput);
        
        if (!cleanOutput) {
          console.error('❌ Empty Python output');
          return res.status(500).json({ error: "No output from Python script" });
        }

        const prediction = JSON.parse(cleanOutput);
        console.log('✅ Parsed prediction:', prediction);
        
        if (prediction.error) {
          console.error('❌ Python script error:', prediction.error);
          return res.status(500).json({ error: prediction.error });
        }

        // Check if trust verification already happened in Python script
        if (prediction.trust_verification_enabled && prediction.policies) {
          console.log('✅ Trust verification already completed in Python script');
          const response = {
            success: true,
            message: "Policy recommendation with trust verification completed successfully",
            trust_verification_enabled: true,
            trust_verification_timestamp: new Date().toISOString(),
            policies: prediction.policies,
            confidence: prediction.confidence,
            method: prediction.method
          };
          return res.json(response);
        }

        // Fallback: Handle legacy format and add trust verification
        console.log('🔄 Applying trust verification in Node.js...');
        
        // Prepare policies for trust score prediction
        let policies = [];
        if (prediction.policies && Array.isArray(prediction.policies)) {
          policies = prediction.policies;
        } else if (prediction.name) {
          policies = [{
            name: prediction.name,
            why: prediction.why || 'No description available'
          }];
        } else {
          policies = [prediction];
        }

        console.log(`🎯 Processing ${policies.length} policies for trust verification`);

        // Enhanced trust verification function - Replace the existing enhancedTrustVerification function
        async function enhancedTrustVerification(policies, userData) {
          console.log(`🔧 Starting enhanced trust verification for ${policies.length} policies`);
          
          const policiesWithTrust = await Promise.all(policies.map(async (policy, index) => {
            console.log(`🛡️ Processing trust verification for policy ${index + 1}: ${policy.name}`);
            
            try {
              // Get enhanced policy data from Excel
              const enhancedPolicyData = await prepareEnhancedPolicyData(policy.name, userData);
              
              console.log(`📊 Enhanced policy data for ${policy.name}:`, enhancedPolicyData);
              
              // Prepare policy data for trust prediction
              const policyData = {
                name: policy.name,
                type: enhancedPolicyData.policy_type,
                transparency_score: enhancedPolicyData.transparency_score,
                suitability_score: enhancedPolicyData.suitability_score,
                financial_safety_score: enhancedPolicyData.financial_safety_score,
                compliance_score: enhancedPolicyData.compliance_score
              };

              console.log(`📊 Policy data for trust prediction:`, policyData);
              console.log(`👤 User data for trust prediction:`, userData);

              // Call trust prediction Python script
              const trustProcess = spawn(pythonpath, [
                path.join(__dirname, 'trust_policy.py'),
                JSON.stringify(userData),
                JSON.stringify(policyData)
              ], {
                cwd: __dirname,
                timeout: 30000
              });

              let trustOutput = '';
              let trustError = '';

              trustProcess.stdout.on('data', (data) => {
                trustOutput += data.toString();
              });

              trustProcess.stderr.on('data', (data) => {
                trustError += data.toString();
                console.log(`🛡️ Trust script stderr for ${policy.name}:`, data.toString());
              });

              return new Promise((resolve) => {
                const trustTimeout = setTimeout(() => {
                  console.error(`⏰ Trust verification timeout for ${policy.name}`);
                  trustProcess.kill();
                  resolve({
                    ...policy,
                    trust_score: 0.5,
                    trust_confidence: 'Medium',
                    trust_interpretation: {
                      level: 'Medium Trust',
                      description: 'Trust verification timed out',
                      recommendation: 'Review Carefully'
                    },
                    trust_error: 'Timeout',
                    policy_type: enhancedPolicyData.policy_type,
                    enhanced_scores: enhancedPolicyData
                  });
                }, 30000);

                trustProcess.on('close', (trustCode) => {
                  clearTimeout(trustTimeout);
                  console.log(`🛡️ Trust process finished for ${policy.name} with code: ${trustCode}`);
                  
                  if (trustCode !== 0) {
                    console.error(`❌ Trust prediction failed for ${policy.name} with code ${trustCode}`);
                    console.error(`❌ Trust stderr:`, trustError);
                    resolve({
                      ...policy,
                      trust_score: 0.5,
                      trust_confidence: 'Medium',
                      trust_interpretation: {
                        level: 'Medium Trust',
                        description: `Trust verification failed. Error: ${trustError}`,
                        recommendation: 'Review Carefully'
                      },
                      trust_error: `Exit code ${trustCode}: ${trustError}`,
                      policy_type: enhancedPolicyData.policy_type,
                      enhanced_scores: enhancedPolicyData
                    });
                  } else {
                    try {
                      const cleanOutput = trustOutput.trim();
                      console.log(`📊 Trust script raw output for ${policy.name}:`, cleanOutput);
                      
                      if (!cleanOutput) {
                        console.error(`❌ Empty trust output for ${policy.name}`);
                        resolve({
                          ...policy,
                          trust_score: 0.5,
                          trust_confidence: 'Medium',
                          trust_interpretation: {
                            level: 'Medium Trust',
                            description: 'Empty trust verification output',
                            recommendation: 'Review Carefully'
                          },
                          trust_error: 'Empty output',
                          policy_type: enhancedPolicyData.policy_type,
                          enhanced_scores: enhancedPolicyData
                        });
                        return;
                      }
                      
                      const trustResult = JSON.parse(cleanOutput);
                      
                      if (trustResult.success) {
                        console.log(`✅ Trust verification successful for ${policy.name}:`, trustResult);
                        resolve({
                          ...policy,
                          trust_score: trustResult.trust_score,
                          trust_confidence: trustResult.confidence_level,
                          trust_interpretation: trustResult.interpretation,
                          trust_model_used: trustResult.model_used,
                          trust_timestamp: trustResult.prediction_timestamp,
                          policy_type: enhancedPolicyData.policy_type,
                          enhanced_scores: enhancedPolicyData,
                          component_scores: trustResult.component_scores,
                          adjustment_factors: trustResult.adjustment_factors
                        });
                      } else {
                        console.error(`❌ Trust prediction error for ${policy.name}:`, trustResult.error);
                        resolve({
                          ...policy,
                          trust_score: 0.5,
                          trust_confidence: 'Medium',
                          trust_interpretation: {
                            level: 'Medium Trust',
                            description: `Trust verification failed: ${trustResult.error}`,
                            recommendation: 'Review Carefully'
                          },
                          trust_error: trustResult.error,
                          policy_type: enhancedPolicyData.policy_type,
                          enhanced_scores: enhancedPolicyData
                        });
                      }
                    } catch (parseErr) {
                      console.error(`❌ Trust prediction parse error for ${policy.name}:`, parseErr);
                      console.error(`❌ Raw trust output:`, trustOutput);
                      resolve({
                        ...policy,
                        trust_score: 0.5,
                        trust_confidence: 'Medium',
                        trust_interpretation: {
                          level: 'Medium Trust',
                          description: `Trust verification parsing failed: ${parseErr.message}`,
                          recommendation: 'Review Carefully'
                        },
                        trust_error: `Parse error: ${parseErr.message}`,
                        policy_type: enhancedPolicyData.policy_type,
                        enhanced_scores: enhancedPolicyData
                      });
                    }
                  }
                });

                trustProcess.on('error', (error) => {
                  clearTimeout(trustTimeout);
                  console.error(`❌ Trust process error for ${policy.name}:`, error);
                  resolve({
                    ...policy,
                    trust_score: 0.5,
                    trust_confidence: 'Medium',
                    trust_interpretation: {
                      level: 'Medium Trust',
                      description: `Trust verification process error: ${error.message}`,
                      recommendation: 'Review Carefully'
                    },
                    trust_error: `Process error: ${error.message}`,
                    policy_type: enhancedPolicyData.policy_type,
                    enhanced_scores: enhancedPolicyData
                  });
                });
              });
            } catch (error) {
              console.error(`❌ Enhanced trust prediction setup error for ${policy.name}:`, error);
              return {
                ...policy,
                trust_score: 0.5,
                trust_confidence: 'Medium',
                trust_interpretation: {
                  level: 'Medium Trust',
                  description: `Enhanced trust verification setup failed: ${error.message}`,
                  recommendation: 'Review Carefully'
                },
                trust_error: `Setup error: ${error.message}`
              };
            }
          }));

          return policiesWithTrust;
        }

        // Apply trust verification to policies
        const policiesWithTrust = await enhancedTrustVerification(policies, userData);

        console.log('✅ Trust verification completed for all policies');
        console.log(`=== POLICY RECOMMENDATION DEBUG END ===`);

        const response = {
          success: true,
          message: "Policy recommendation with trust verification completed successfully",
          trust_verification_enabled: true,
          trust_verification_timestamp: new Date().toISOString(),
          policies: policiesWithTrust,
          confidence: prediction.confidence,
          method: prediction.method
        };

        res.json(response);

      } catch (parseErr) {
        console.error('❌ Error parsing Python output:', parseErr);
        console.error('❌ Raw Python output:', pythonOutput);
        return res.status(500).json({ 
          error: "Invalid policy recommendation format",
          details: parseErr.message
        });
      }
    });

    pythonProcess.on('error', (error) => {
      console.error('❌ Failed to start Python process:', error);
      res.status(500).json({
        error: 'Failed to start policy recommendation script',
        details: error.message
      });
    });

  } catch (error) {
    console.error('❌ Policy recommendation error:', error);
    res.status(500).json({ 
      error: "Internal server error", 
      details: error.message 
    });
  }
});

// Function to get policy description from your Excel data
function getPolicyDescription(policyName) {
  try {
    const policies = readExcelFile();
    const policy = policies.find(p => p.Policies === policyName);
    return policy ? (policy.Description || policy.Combined_Text || '') : '';
  } catch (error) {
    console.error('Error getting policy description:', error);
    return '';
  }
}

// Enhanced policy data preparation - gets scores directly from Excel
function prepareEnhancedPolicyData(policyName, userProfile) {
  console.log(`🔍 Getting enhanced policy data for: ${policyName}`);
  
  return new Promise((resolve, reject) => {
    // Read Excel file directly to get policy scores
    try {
      const policies = readExcelFile();
      console.log(`📊 Loaded ${policies.length} policies from Excel`);
      
      // Find policy by name (case-insensitive partial match)
      const policyNameLower = policyName.toLowerCase();
      let foundPolicy = policies.find(p => 
        p.Policies && p.Policies.toLowerCase() === policyNameLower
      );
      
      if (!foundPolicy) {
        // Try partial match
        foundPolicy = policies.find(p => 
          p.Policies && p.Policies.toLowerCase().includes(policyNameLower)
        );
      }
      
      if (!foundPolicy) {
        console.log(`❌ Policy '${policyName}' not found in Excel, using defaults`);
        // Use default values if policy not found
        resolve({
          policy_type: 'Life Insurance',
          transparency_score: 0.75,
          suitability_score: 0.70,
          financial_safety_score: 0.80,
          compliance_score: 0.85
        });
        return;
      }
      
      console.log(`✅ Found policy in Excel: ${foundPolicy.Policies}`);
      
      // Extract scores from Excel
      const enhancedData = {
        policy_type: foundPolicy.policy_type || 'Life Insurance',
        transparency_score: parseFloat(foundPolicy.transparency_score) || 0.75,
        suitability_score: parseFloat(foundPolicy.suitability_score) || 0.70,
        financial_safety_score: parseFloat(foundPolicy.financial_safety_score) || 0.80,
        compliance_score: parseFloat(foundPolicy.compliance_score) || 0.85
      };
      
      console.log(`📈 Policy scores from Excel:`, enhancedData);
      resolve(enhancedData);
      
    } catch (error) {
      console.error(`❌ Error reading Excel file:`, error);
      // Use default values if Excel reading fails
      resolve({
        policy_type: 'Life Insurance',
        transparency_score: 0.75,
        suitability_score: 0.70,
        financial_safety_score: 0.80,
        compliance_score: 0.85
      });
    }
  });
}

// Add new API endpoint for standalone trust score prediction
app.post('/api/trust-score', requireAuth, async (req, res) => {
  try {
    const { policyName, policyType } = req.body;
    const username = req.session.username;

    if (!policyName) {
      return res.status(400).json({ error: "Policy name is required" });
    }

    // Get user profile data
    const userProfile = await getUserProfileData(username);
    if (!userProfile) {
      return res.status(400).json({ 
        error: "User profile not found. Please complete your profile first." 
      });
    }

    // Prepare user data
    const userData = {
      username: username,
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

    // Prepare policy data
    const enhancedPolicyData = await prepareEnhancedPolicyData(policyName, userData);
    const policyData = {
      name: policyName,
      type: enhancedPolicyData.policy_type,
      transparency_score: enhancedPolicyData.transparency_score,
      suitability_score: enhancedPolicyData.suitability_score,
      financial_safety_score: enhancedPolicyData.financial_safety_score,
      compliance_score: enhancedPolicyData.compliance_score
    };

    // Call trust prediction Python script
    const trustProcess = spawn(pythonpath, [
      path.join(__dirname, 'trust_policy.py'),
      JSON.stringify(userData),
      JSON.stringify(policyData)
    ], {
      cwd: __dirname
    });

    let trustOutput = '';
    let trustError = '';

    trustProcess.stdout.on('data', (data) => {
      trustOutput += data.toString();
    });

    trustProcess.stderr.on('data', (data) => {
      trustError += data.toString();
    });

    trustProcess.on('close', (code) => {
      if (code !== 0) {
        console.error('Trust prediction script error code:', code);
        console.error('Trust stderr:', trustError);
        return res.status(500).json({ 
          error: "Trust score prediction failed", 
          details: trustError || `Trust script exited with code ${code}`
        });
      }

      try {
        const cleanOutput = trustOutput.trim();
        console.log('Trust prediction output:', cleanOutput);
        
        if (!cleanOutput) {
          console.error('Empty trust prediction output');
          return res.status(500).json({ error: "No output from trust prediction script" });
        }

        const trustResult = JSON.parse(cleanOutput);
        
        if (!trustResult.success) {
          console.error('Trust prediction error:', trustResult.error);
          return res.status(500).json({ error: trustResult.error });
        }

        console.log('Trust score prediction successful:', trustResult);
        res.json(trustResult);
        
      } catch (parseErr) {
        console.error('Error parsing trust prediction output:', parseErr);
        console.error('Raw trust output:', trustOutput);
        return res.status(500).json({ 
          error: "Invalid trust prediction format",
          details: parseErr.message
        });
      }
    });

    trustProcess.on('error', (error) => {
      console.error('Failed to start trust prediction process:', error);
      res.status(500).json({
        error: 'Failed to start trust prediction script',
        details: error.message
      });
    });

  } catch (error) {
    console.error('Trust score prediction error:', error);
    res.status(500).json({ 
      error: "Internal server error", 
      details: error.message 
    });
  }
});

// UPDATED Handle policy acceptance - Replace your existing route
app.post('/api/accept-policy', requireAuth, async (req, res) => {
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
app.post('/api/decline-policy', requireAuth, (req, res) => {
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
app.post('/api/upselling-recommendations', requireAuth, async (req, res) => {
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
app.post('/api/select-upselling-policy', requireAuth, async (req, res) => {
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
app.get('/api/policy-details/:policyId', requireAuth, (req, res) => {
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

server.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
  console.log(`TIA Chatbot available at http://localhost:${PORT}/tia-chatbot`);
  console.log(`TIA Operator interface available at http://localhost:${PORT}/tia-operator`);

  // Start the Flask chatbot server
  startChainlitServer();

  // Start the Streamlit server
  startStreamlitServer();

  // Handle graceful shutdown
  process.on('SIGINT', () => {
    console.log('Shutting down server...');
    process.exit(0);
  });
});
