//this is dbSetup.js

const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');

// Database initialization
const initDB = () => {
  const dbPath = path.join(__dirname, 'users.db');
  
  try {
    const db = new sqlite3.Database(dbPath, (err) => {
      if (err) {
        console.error('Error opening database:', err);
        throw err;
      }
    });
    
    db.serialize(() => {
      // Create users table with additional fields
      db.run(`
        CREATE TABLE IF NOT EXISTS users (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          username TEXT UNIQUE NOT NULL,
          password TEXT NOT NULL,
          email TEXT UNIQUE NOT NULL,
          totp_secret TEXT NOT NULL,
          role TEXT NOT NULL DEFAULT 'customer', -- New field: 'customer' or 'agent'
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          
          -- New fields for user information
          credit_score INTEGER,
          geography TEXT,
          gender TEXT,
          age INTEGER,
          marital_status TEXT,
          salary REAL,
          tenure INTEGER,
          balance REAL,
          num_products INTEGER,
          has_credit_card BOOLEAN,
          is_active BOOLEAN,
          exited BOOLEAN,
          profile_completed BOOLEAN DEFAULT FALSE,
          selected_policy TEXT,
          upselling_policy TEXT
        )
      `, (err) => {
        if (err) {
          console.error('Error creating users table:', err);
        } else {
          console.log('Users table created or already exists');
        }
      });

      // Create password_reset_otps table for OTP functionality
      db.run(`
        CREATE TABLE IF NOT EXISTS password_reset_otps (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          email TEXT NOT NULL,
          otp_code TEXT NOT NULL,
          expires_at DATETIME NOT NULL,
          used BOOLEAN DEFAULT FALSE,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (email) REFERENCES users(email)
        )
      `, (err) => {
        if (err) {
          console.error('Error creating password_reset_otps table:', err);
        } else {
          console.log('Password reset OTPs table created or already exists');
        }
      });

      // Add this in your database initialization
      db.run(`ALTER TABLE users ADD COLUMN selected_policy TEXT`, (err) => {
        if (err && !err.message.includes('duplicate column name')) {
          console.error('Error adding selected_policy column:', err);
        }
      });

      db.run(`ALTER TABLE users ADD COLUMN upselling_policy TEXT`, (err) => {
        if (err && !err.message.includes('duplicate column name')) {
          console.error('Error adding upselling_policy column:', err);
        }
      });

      // Add this ALTER statement to add role column to existing databases
      db.run(`ALTER TABLE users ADD COLUMN role TEXT DEFAULT 'customer'`, (err) => {
        if (err && !err.message.includes('duplicate column name')) {
          console.error('Error adding role column:', err);
        }
      });
      
      // Create indexes
      db.run(`CREATE INDEX IF NOT EXISTS idx_users_email ON users(email)`);
      db.run(`CREATE INDEX IF NOT EXISTS idx_users_username ON users(username)`);
      db.run(`CREATE INDEX IF NOT EXISTS idx_otp_email ON password_reset_otps(email)`);
      db.run(`CREATE INDEX IF NOT EXISTS idx_otp_code ON password_reset_otps(otp_code)`);
    });
    
    db.close((err) => {
      if (err) {
        console.error('Error closing database:', err);
      }
    });
    
    console.log('Database initialized');
    return dbPath;
  } catch (error) {
    console.error('Database initialization failed:', error);
    throw error;
  }
};

// Delete database if exists
const deleteDB = () => {
  const dbPath = path.join(__dirname, 'users.db');
  try {
    if (fs.existsSync(dbPath)) {
      fs.unlinkSync(dbPath);
      console.log('Database deleted successfully');
      return true;
    } else {
      console.log('Database file does not exist');
      return false;
    }
  } catch (error) {
    console.error('Error deleting database:', error);
    return false;
  }
};

// Get database connection
const getDB = () => {
  const dbPath = path.join(__dirname, 'users.db');
  return new sqlite3.Database(dbPath, (err) => {
    if (err) {
      console.error('Error connecting to database:', err);
      throw err;
    }
  });
};

// OTP utility functions
const storeOTP = (email, otp, expiresInMinutes = 10) => {
  return new Promise((resolve, reject) => {
    const db = getDB();
    const expiresAt = new Date(Date.now() + expiresInMinutes * 60 * 1000);
    
    // First, invalidate any existing OTPs for this email
    db.run(
      "UPDATE password_reset_otps SET used = TRUE WHERE email = ? AND used = FALSE",
      [email],
      function(err) {
        if (err) {
          console.error('Error invalidating old OTPs:', err);
        }
        
        // Insert new OTP
        db.run(
          "INSERT INTO password_reset_otps (email, otp_code, expires_at) VALUES (?, ?, ?)",
          [email, otp, expiresAt.toISOString()],
          function(err) {
            if (err) {
              reject(err);
            } else {
              resolve(this.lastID);
            }
            db.close();
          }
        );
      }
    );
  });
};

const verifyOTP = (email, otp) => {
  return new Promise((resolve, reject) => {
    const db = getDB();
    const now = new Date().toISOString();
    
    db.get(
      `SELECT * FROM password_reset_otps 
       WHERE email = ? AND otp_code = ? AND used = FALSE AND expires_at > ?
       ORDER BY created_at DESC LIMIT 1`,
      [email, otp, now],
      (err, row) => {
        if (err) {
          reject(err);
        } else if (row) {
          // Mark OTP as used
          db.run(
            "UPDATE password_reset_otps SET used = TRUE WHERE id = ?",
            [row.id],
            function(updateErr) {
              if (updateErr) {
                console.error('Error marking OTP as used:', updateErr);
              }
              resolve(true);
            }
          );
        } else {
          resolve(false);
        }
        db.close();
      }
    );
  });
};

// Clean up expired OTPs (should be called periodically)
const cleanupExpiredOTPs = () => {
  return new Promise((resolve, reject) => {
    const db = getDB();
    const now = new Date().toISOString();
    
    db.run(
      "DELETE FROM password_reset_otps WHERE expires_at < ?",
      [now],
      function(err) {
        if (err) {
          reject(err);
        } else {
          console.log(`Cleaned up ${this.changes} expired OTPs`);
          resolve(this.changes);
        }
        db.close();
      }
    );
  });
};

// Get user by email
const getUserByEmail = (email) => {
  return new Promise((resolve, reject) => {
    const db = getDB();
    db.get(
      "SELECT * FROM users WHERE email = ?",
      [email],
      (err, row) => {
        if (err) {
          reject(err);
        } else {
          resolve(row || null);
        }
        db.close();
      }
    );
  });
};

// Update user password
const updateUserPassword = (email, hashedPassword) => {
  return new Promise((resolve, reject) => {
    const db = getDB();
    const updatedAt = new Date().toISOString();
    
    db.run(
      "UPDATE users SET password = ?, updated_at = ? WHERE email = ?",
      [hashedPassword, updatedAt, email],
      function(err) {
        if (err) {
          console.error('Error updating password:', err);
          reject(err);
        } else {
          console.log(`Password updated for email: ${email}, rows affected: ${this.changes}`);
          resolve(this.changes); // Returns number of rows affected
        }
        db.close();
      }
    );
  });
};

// NEW FUNCTION: Update user profile information
const updateUserProfile = (username, profileData) => {
  return new Promise((resolve, reject) => {
    const db = getDB();
    const updatedAt = new Date().toISOString();
    
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
    } = profileData;
    
    db.run(
      `UPDATE users SET 
        credit_score = ?, 
        geography = ?, 
        gender = ?, 
        age = ?, 
        marital_status = ?, 
        salary = ?, 
        tenure = ?, 
        balance = ?, 
        num_products = ?, 
        has_credit_card = ?, 
        is_active = ?, 
        exited = ?, 
        profile_completed = TRUE,
        updated_at = ?
      WHERE username = ?`,
      [
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
        exited,
        updatedAt,
        username
      ],
      function(err) {
        if (err) {
          console.error('Error updating user profile:', err);
          reject(err);
        } else {
          console.log(`Profile updated for user: ${username}, rows affected: ${this.changes}`);
          resolve(this.changes);
        }
        db.close();
      }
    );
  });
};

// NEW FUNCTION: Check if user profile is completed
const isProfileCompleted = (username) => {
  return new Promise((resolve, reject) => {
    const db = getDB();
    db.get(
      "SELECT profile_completed FROM users WHERE username = ?",
      [username],
      (err, row) => {
        if (err) {
          reject(err);
        } else {
          resolve(row ? row.profile_completed : false);
        }
        db.close();
      }
    );
  });
};

// Enhanced OTP verification that also handles cleanup
const verifyAndCleanupOTP = (email, otp) => {
  return new Promise((resolve, reject) => {
    const db = getDB();
    const now = new Date().toISOString();
    
    db.get(
      `SELECT * FROM password_reset_otps 
       WHERE email = ? AND otp_code = ? AND used = FALSE AND expires_at > ?
       ORDER BY created_at DESC LIMIT 1`,
      [email, otp, now],
      (err, row) => {
        if (err) {
          reject(err);
          db.close();
          return;
        }
        
        if (row) {
          // Mark OTP as used
          db.run(
            "UPDATE password_reset_otps SET used = TRUE WHERE id = ?",
            [row.id],
            function(updateErr) {
              if (updateErr) {
                console.error('Error marking OTP as used:', updateErr);
                reject(updateErr);
              } else {
                console.log(`OTP verified and marked as used for email: ${email}`);
                resolve(true);
              }
              db.close();
            }
          );
        } else {
          console.log(`Invalid or expired OTP for email: ${email}`);
          resolve(false);
          db.close();
        }
      }
    );
  });
};

module.exports = {
  initDB,
  deleteDB,
  getDB,
  storeOTP,
  verifyOTP,
  verifyAndCleanupOTP,
  cleanupExpiredOTPs,
  getUserByEmail,
  updateUserPassword,
  updateUserProfile,      // NEW
  isProfileCompleted      // NEW
};
  