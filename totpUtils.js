//This is totpUtils.js

const speakeasy = require('speakeasy');
const qrcode = require('qrcode');

// Generate a new TOTP secret
const generateSecret = (username) => {
  return speakeasy.generateSecret({
    name: `YourAppName:${username}`,
    issuer: 'YourAppName'
  });
};

// Verify TOTP token
const verifyToken = (secret, token) => {
  return speakeasy.totp.verify({
    secret: secret,
    encoding: 'base32',
    token: token,
    window: 1 // Allows for 1 step of time drift (30 seconds)
  });
};

// Generate QR code as a data URL
const generateQRCodeURL = async (otpauth_url) => {
  try {
    return await qrcode.toDataURL(otpauth_url);
  } catch (err) {
    console.error('Error generating QR code:', err);
    throw err;
  }
};

module.exports = {
  generateSecret,
  verifyToken,
  generateQRCodeURL
};
