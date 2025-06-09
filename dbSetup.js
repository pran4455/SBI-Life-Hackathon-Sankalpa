//this is dbSetup.js

const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');

// Get the database path based on environment
const getDBPath = () => {
  if (process.env.RENDER_STORAGE_PATH) {
    const storagePath = process.env.RENDER_STORAGE_PATH;
    // Ensure storage directory exists
    if (!fs.existsSync(storagePath)) {
      fs.mkdirSync(storagePath, { recursive: true });
    }
    return path.join(storagePath, 'users.db');
  }
  return path.join(__dirname, 'users.db');
};

// Function to initialize database
function initDB(dbPath) {
    try {
        // Ensure the directory exists
        const dbDir = path.dirname(dbPath);
        if (!fs.existsSync(dbDir)) {
            fs.mkdirSync(dbDir, { recursive: true });
        }

        console.log('Initializing database at:', dbPath);
        const db = new sqlite3.Database(dbPath, (err) => {
            if (err) {
                console.error('Error opening database:', err);
                throw err;
            }
            console.log('Database initialized');
        });

        // Create users table if it doesn't exist
        db.run(`
            CREATE TABLE IF NOT EXISTS users (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                username TEXT UNIQUE NOT NULL,
                password TEXT NOT NULL,
                email TEXT UNIQUE NOT NULL,
                totp_secret TEXT,
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
                selected_policy TEXT,
                upselling_policy TEXT,
                profile_completed BOOLEAN DEFAULT 0,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        `);

        // Create password_reset_otps table
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
        `);

        // Create indexes
        db.run(`CREATE INDEX IF NOT EXISTS idx_users_email ON users(email)`);
        db.run(`CREATE INDEX IF NOT EXISTS idx_users_username ON users(username)`);
        db.run(`CREATE INDEX IF NOT EXISTS idx_otp_email ON password_reset_otps(email)`);
        db.run(`CREATE INDEX IF NOT EXISTS idx_otp_code ON password_reset_otps(otp_code)`);

        return db;
    } catch (error) {
        console.error('Database initialization error:', error);
        throw error;
    }
}

// Function to get database connection
function getDB() {
    const dbPath = path.join(process.env.DATA_DIR || __dirname, 'users.db');
    return new sqlite3.Database(dbPath, (err) => {
        if (err) {
            console.error('Error connecting to database:', err);
            throw err;
        }
    });
}

// Function to check if user profile is completed
function isProfileCompleted(username) {
    return new Promise((resolve, reject) => {
        const db = getDB();
        db.get(
            "SELECT profile_completed FROM users WHERE username = ?",
            [username],
            (err, row) => {
                db.close();
                if (err) {
                    reject(err);
                } else {
                    resolve(row ? row.profile_completed === 1 : false);
                }
            }
        );
    });
}

// Function to update user profile
function updateUserProfile(username, profileData) {
    return new Promise((resolve, reject) => {
        const db = getDB();
        const fields = Object.keys(profileData);
        const values = Object.values(profileData);
        
        const setClause = fields.map(field => `${field} = ?`).join(', ');
        const query = `
            UPDATE users 
            SET ${setClause}, profile_completed = 1, updated_at = CURRENT_TIMESTAMP 
            WHERE username = ?
        `;
        
        db.run(query, [...values, username], function(err) {
            db.close();
            if (err) {
                reject(err);
            } else {
                resolve(this.changes);
            }
        });
    });
}

// Function to update user password
function updateUserPassword(email, hashedPassword) {
    return new Promise((resolve, reject) => {
        const db = getDB();
        db.run(
            "UPDATE users SET password = ?, updated_at = CURRENT_TIMESTAMP WHERE email = ?",
            [hashedPassword, email],
            function(err) {
                db.close();
                if (err) {
                    reject(err);
                } else {
                    resolve(this.changes);
                }
            }
        );
    });
}

// Function to get user by username
function getUserByUsername(username) {
    return new Promise((resolve, reject) => {
        const db = getDB();
        db.get("SELECT * FROM users WHERE username = ?", [username], (err, row) => {
            db.close();
            if (err) {
                reject(err);
            } else {
                resolve(row);
            }
        });
    });
}

// Function to get user by email
function getUserByEmail(email) {
    return new Promise((resolve, reject) => {
        const db = getDB();
        db.get("SELECT * FROM users WHERE email = ?", [email], (err, row) => {
            db.close();
            if (err) {
                reject(err);
            } else {
                resolve(row);
            }
        });
    });
}

// Function to insert new user
function insertUser(username, password, email, totp_secret) {
    return new Promise((resolve, reject) => {
        const db = getDB();
        db.run(
            "INSERT INTO users (username, password, email, totp_secret) VALUES (?, ?, ?, ?)",
            [username, password, email, totp_secret],
            function(err) {
                db.close();
                if (err) {
                    reject(err);
                } else {
                    resolve(this.lastID);
                }
            }
        );
    });
}

// Function to update TOTP secret
function updateTotpSecret(email, totp_secret) {
    return new Promise((resolve, reject) => {
        const db = getDB();
        db.run(
            "UPDATE users SET totp_secret = ? WHERE email = ?",
            [totp_secret, email],
            function(err) {
                db.close();
                if (err) {
                    reject(err);
                } else {
                    resolve(this.changes);
                }
            }
        );
    });
}

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

// Test database connection
const testDB = async () => {
  return new Promise((resolve, reject) => {
    const db = getDB();
    db.get("SELECT 1", (err, row) => {
      if (err) {
        reject(err);
      } else {
        resolve(true);
      }
    });
    db.close();
  });
};

// Get user count (for testing)
const getUserCount = async () => {
  return new Promise((resolve, reject) => {
    const db = getDB();
    db.get("SELECT COUNT(*) as count FROM users", (err, row) => {
      if (err) {
        reject(err);
      } else {
        resolve(row.count);
      }
    });
    db.close();
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

module.exports = {
  initDB,
  deleteDB,
  getDB,
  testDB,
  getUserCount,
  storeOTP,
  verifyOTP,
  verifyAndCleanupOTP,
  cleanupExpiredOTPs,
  getUserByUsername,
  getUserByEmail,
  insertUser,
  updateTotpSecret,
  updateUserPassword,
  updateUserProfile,
  isProfileCompleted
};
