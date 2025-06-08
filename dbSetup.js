//this is dbSetup.js

const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');

let dbInstance = null;

// Get the database path based on environment
const getDBPath = () => {
    const dataDir = process.env.DATA_DIR || path.join(__dirname, 'data');
    console.log('Using data directory:', dataDir);
    
    // Ensure data directory exists with proper permissions
    if (!fs.existsSync(dataDir)) {
        console.log('Creating data directory:', dataDir);
        fs.mkdirSync(dataDir, { recursive: true, mode: 0o777 });
    }
    
    const dbPath = path.join(dataDir, 'users.db');
    console.log('Database path:', dbPath);
    return dbPath;
};

// Function to create a new database connection
function createConnection() {
    const dbPath = getDBPath();
    
    return new Promise((resolve, reject) => {
        const db = new sqlite3.Database(dbPath, sqlite3.OPEN_READWRITE | sqlite3.OPEN_CREATE, (err) => {
            if (err) {
                console.error('Error opening database:', err.message);
                reject(err);
                return;
            }
            
            // Configure database
            db.serialize(() => {
                db.run('PRAGMA foreign_keys = ON');
                db.run('PRAGMA journal_mode = WAL');
                db.run('PRAGMA synchronous = NORMAL');
                db.run('PRAGMA temp_store = MEMORY');
                db.run('PRAGMA mmap_size = 30000000000');
                db.run('PRAGMA page_size = 4096');
                db.run('PRAGMA cache_size = -2000');
            });
            
            resolve(db);
        });
    });
}

// Function to initialize database
async function initDB() {
    try {
        if (dbInstance) {
            console.log('Database already initialized');
            return dbInstance;
        }

        console.log('Initializing database...');
        dbInstance = await createConnection();
        
        // Create tables
        await new Promise((resolve, reject) => {
            dbInstance.serialize(() => {
                // Create users table
                dbInstance.run(`
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
                `, (err) => {
                    if (err) {
                        console.error('Error creating users table:', err.message);
                        reject(err);
                        return;
                    }
                    console.log('Users table created/verified successfully');
                });

                // Create password_reset_otps table
                dbInstance.run(`
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
                        console.error('Error creating password_reset_otps table:', err.message);
                        reject(err);
                        return;
                    }
                    console.log('Password reset OTPs table created/verified successfully');
                });

                // Create indexes
                const indexQueries = [
                    `CREATE INDEX IF NOT EXISTS idx_users_email ON users(email)`,
                    `CREATE INDEX IF NOT EXISTS idx_users_username ON users(username)`,
                    `CREATE INDEX IF NOT EXISTS idx_otp_email ON password_reset_otps(email)`,
                    `CREATE INDEX IF NOT EXISTS idx_otp_code ON password_reset_otps(otp_code)`
                ];

                let completedIndexes = 0;
                indexQueries.forEach((query) => {
                    dbInstance.run(query, (err) => {
                        if (err) {
                            console.error(`Error creating index: ${query}`, err.message);
                        }
                        completedIndexes++;
                        if (completedIndexes === indexQueries.length) {
                            resolve();
                        }
                    });
                });
            });
        });

        console.log('Database initialization complete');
        return dbInstance;
    } catch (error) {
        console.error('Database initialization error:', error.message);
        throw error;
    }
}

// Function to get database connection
async function getDB() {
    if (!dbInstance) {
        console.log('No database instance found, initializing...');
        return await initDB();
    }
    return dbInstance;
}

// Function to close database connection
function closeDB() {
    return new Promise((resolve, reject) => {
        if (dbInstance) {
            dbInstance.close((err) => {
                if (err) {
                    console.error('Error closing database:', err.message);
                    reject(err);
                } else {
                    console.log('Database connection closed');
                    dbInstance = null;
                    resolve();
                }
            });
        } else {
            resolve();
        }
    });
}

// Handle process termination
process.on('SIGINT', async () => {
    await closeDB();
    process.exit(0);
});

process.on('SIGTERM', async () => {
    await closeDB();
    process.exit(0);
});

// Initialize database on module load
(async () => {
    try {
        await initDB();
    } catch (error) {
        console.error('Failed to initialize database:', error.message);
        process.exit(1);
    }
})();

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
  cleanupExpiredOTPs,
  getUserByUsername,
  getUserByEmail,
  insertUser,
  updateTotpSecret,
  updateUserPassword,
  updateUserProfile,
  isProfileCompleted,
  closeDB
};
