const express = require('express');
const bcrypt = require('bcryptjs');
const { getDB } = require('./dbSetup');
const { generateSecret, verifyToken, generateQRCodeURL } = require('./totpUtils');
const { sendEmail, sendQRCodeEmail, sendRecoveryEmail } = require('./emailService');

const router = express.Router();

// Utility function to validate email format
const isValidEmail = (email) => {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
};

// Utility function to validate password strength
const isValidPassword = (password) => {
  // At least 6 characters
  return password && password.length >= 6;
};

// Register User Route
router.get('/register', (req, res) => {
  res.render('register', { error: null, success: null });
});

router.post('/register', async (req, res) => {
  try {
    const { username, email, password, confirmPassword } = req.body;
    
    // Input validation
    if (!username || !email || !password) {
      return res.render('register', { 
        error: 'All fields are required!', 
        success: null 
      });
    }

    if (!isValidEmail(email)) {
      return res.render('register', { 
        error: 'Please enter a valid email address!', 
        success: null 
      });
    }

    if (!isValidPassword(password)) {
      return res.render('register', { 
        error: 'Password must be at least 6 characters long!', 
        success: null 
      });
    }

    if (password !== confirmPassword) {
      return res.render('register', { 
        error: 'Passwords do not match!', 
        success: null 
      });
    }
    
    const db = getDB();
    
    // Check if username already exists
    const existingUser = await new Promise((resolve, reject) => {
      db.get("SELECT * FROM users WHERE username = ?", [username], (err, user) => {
        if (err) reject(err);
        else resolve(user);
      });
    });
    
    if (existingUser) {
      return res.render('register', { 
        error: 'Username already exists! Please choose a different one.', 
        success: null 
      });
    }

    // Check if email already exists
    const existingEmail = await new Promise((resolve, reject) => {
      db.get("SELECT * FROM users WHERE email = ?", [email], (err, user) => {
        if (err) reject(err);
        else resolve(user);
      });
    });
    
    if (existingEmail) {
      return res.render('register', { 
        error: 'Email already registered! Please use a different email or try account recovery.', 
        success: null 
      });
    }
    
    // Generate hashed password and TOTP secret
    const hashedPassword = await bcrypt.hash(password, 12);
    const secret = generateSecret(username);
    
    // Insert new user
    await new Promise((resolve, reject) => {
      db.run(
        "INSERT INTO users (username, password, email, totp_secret) VALUES (?, ?, ?, ?)",
        [username, hashedPassword, email, secret.base32],
        function(err) {
          if (err) reject(err);
          else resolve(this.lastID);
        }
      );
    });
    
    // Send email with QR code info (non-blocking)
    try {
      await sendQRCodeEmail(secret.base32, secret.otpauth_url, email);
      console.log(`Registration email sent to ${email}`);
    } catch (emailErr) {
      console.error('Email sending failed:', emailErr);
      // Continue registration even if email fails
    }
    
    res.render('register', { 
      error: null, 
      success: 'Account created successfully! Please check your email for TOTP setup instructions and then login.' 
    });

  } catch (error) {
    console.error('Registration error:', error);
    res.render('register', { 
      error: 'Registration failed. Please try again.', 
      success: null 
    });
  }
});

// Login Route
router.get('/login', (req, res) => {
  res.render('login', { error: null });
});

router.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    
    if (!username || !password) {
      return res.render('login', { error: 'Username and password are required!' });
    }
    
    const db = getDB();
    
    const user = await new Promise((resolve, reject) => {
      db.get("SELECT * FROM users WHERE username = ?", [username], (err, user) => {
        if (err) reject(err);
        else resolve(user);
      });
    });
    
    if (!user) {
      return res.render('login', { error: 'Invalid username or password' });
    }

    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) {
      return res.render('login', { error: 'Invalid username or password' });
    }
    
    // Store username in session for TOTP verification
    req.session.username = username;
    req.session.pendingAuth = true;
    res.redirect('/verify_totp');

  } catch (error) {
    console.error('Login error:', error);
    res.render('login', { error: 'Login failed. Please try again.' });
  }
});

// TOTP Verification Route
router.get('/verify_totp', (req, res) => {
  if (!req.session.username || !req.session.pendingAuth) {
    return res.redirect('/login');
  }
  
  res.render('verify_totp', { error: null });
});

router.post('/verify_totp', async (req, res) => {
  try {
    const { totp } = req.body;
    const username = req.session.username;
    
    if (!username || !req.session.pendingAuth) {
      return res.redirect('/login');
    }

    if (!totp || totp.length !== 6) {
      return res.render('verify_totp', { error: 'Please enter a valid 6-digit TOTP code.' });
    }
    
    const db = getDB();
    
    const user = await new Promise((resolve, reject) => {
      db.get("SELECT * FROM users WHERE username = ?", [username], (err, user) => {
        if (err) reject(err);
        else resolve(user);
      });
    });
    
    if (!user) {
      return res.redirect('/login');
    }
    
    const isValid = verifyToken(user.totp_secret, totp);
    
    if (isValid) {
      req.session.authenticated = true;
      req.session.pendingAuth = false;
      return res.redirect('/home');
    } else {
      return res.render('verify_totp', { 
        error: 'Invalid TOTP code. Please check your authenticator app and try again.' 
      });
    }

  } catch (error) {
    console.error('TOTP verification error:', error);
    res.render('verify_totp', { error: 'Verification failed. Please try again.' });
  }
});

// QR Code Generation Route
router.get('/generate_qr_code', async (req, res) => {
  try {
    const username = req.session.username;
    
    if (!username) {
      return res.redirect('/login');
    }
    
    const db = getDB();
    
    const user = await new Promise((resolve, reject) => {
      db.get("SELECT * FROM users WHERE username = ?", [username], (err, user) => {
        if (err) reject(err);
        else resolve(user);
      });
    });
    
    if (!user) {
      return res.render('totp_qr_code', { 
        error: 'User not found.', 
        qr_code_image: null 
      });
    }
    
    const otpauth_url = `otpauth://totp/Financial%20AI%20Hub:${username}?secret=${user.totp_secret}&issuer=Financial%20AI%20Hub`;
    const qrCodeDataUrl = await generateQRCodeURL(otpauth_url);
    
    res.render('totp_qr_code', { 
      qr_code_image: qrCodeDataUrl,
      error: null 
    });

  } catch (error) {
    console.error('QR code generation error:', error);
    res.render('totp_qr_code', { 
      error: 'Failed to generate QR code.', 
      qr_code_image: null 
    });
  }
});

// Account Recovery Route
router.get('/recover', (req, res) => {
  res.render('recover', { error: null, success: null });
});

router.post('/recover', async (req, res) => {
  try {
    const { email } = req.body;
    
    if (!email) {
      return res.render('recover', { 
        error: 'Email address is required!', 
        success: null 
      });
    }

    if (!isValidEmail(email)) {
      return res.render('recover', { 
        error: 'Please enter a valid email address!', 
        success: null 
      });
    }
    
    const db = getDB();
    
    const user = await new Promise((resolve, reject) => {
      db.get("SELECT * FROM users WHERE email = ?", [email], (err, user) => {
        if (err) reject(err);
        else resolve(user);
      });
    });
    
    if (!user) {
      return res.render('recover', { 
        error: 'No account found with this email address!', 
        success: null 
      });
    }
    
    // Generate new TOTP secret
    const newSecret = generateSecret(user.username);
    
    // Update user with new secret
    await new Promise((resolve, reject) => {
      db.run(
        "UPDATE users SET totp_secret = ? WHERE email = ?", 
        [newSecret.base32, email], 
        function(err) {
          if (err) reject(err);
          else resolve(this.changes);
        }
      );
    });
    
    // Send recovery email
    try {
      await sendRecoveryEmail(newSecret.base32, newSecret.otpauth_url, email, user.username);
      res.render('recover', { 
        error: null, 
        success: 'Recovery email sent! Please check your email for new TOTP setup instructions.' 
      });
    } catch (emailErr) {
      console.error('Recovery email sending failed:', emailErr);
      res.render('recover', { 
        error: 'Failed to send recovery email. Please try again later.', 
        success: null 
      });
    }

  } catch (error) {
    console.error('Recovery error:', error);
    res.render('recover', { 
      error: 'Account recovery failed. Please try again.', 
      success: null 
    });
  }
});

// Home page (protected route)
router.get('/home', (req, res) => {
  if (!req.session.authenticated) {
    return res.redirect('/login');
  }
  
  res.render('home', { username: req.session.username });
});

// Logout route
router.get('/logout', (req, res) => {
  req.session.destroy((err) => {
    if (err) {
      console.error('Logout error:', err);
    }
    res.redirect('/login');
  });
});

module.exports = router;
