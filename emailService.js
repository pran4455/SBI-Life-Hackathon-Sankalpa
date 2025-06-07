const nodemailer = require('nodemailer');

// Configure your email transporter
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: 'paranthagan2311@gmail.com', // your email
    pass: 'rqbn cdoh xwkj zkry' // Replace with your actual app password
  },
  tls: {
    rejectUnauthorized: false
  }
});

// Test email configuration
const testEmailConnection = async () => {
  try {
    await transporter.verify();
    console.log('Email server is ready to send messages');
    return true;
  } catch (error) {
    console.error('Email configuration error:', error);
    return false;
  }
};

// Send email with proper validation
const sendEmail = async (subject, message, recipient) => {
  try {
    // Validate recipient email
    if (!recipient || typeof recipient !== 'string' || recipient.trim() === '') {
      throw new Error('Valid recipient email address is required');
    }

    // Basic email format validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(recipient.trim())) {
      throw new Error('Invalid email format');
    }

    // Test connection first
    const isReady = await testEmailConnection();
    if (!isReady) {
      throw new Error('Email service not configured properly');
    }

    const info = await transporter.sendMail({
      from: 'paranthagan2311@gmail.com',
      to: recipient.trim(), // Ensure recipient is trimmed
      subject: subject,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #333;">Financial AI Hub - Authentication</h2>
          <div style="background-color: #f5f5f5; padding: 20px; border-radius: 8px;">
            ${message}
          </div>
          <p style="color: #666; font-size: 12px; margin-top: 20px;">
            This is an automated message from Financial AI Hub. Please do not reply to this email.
          </p>
        </div>
      `,
      text: message.replace(/<[^>]*>/g, '') // Strip HTML for text version
    });
    
    console.log('Email sent successfully to:', recipient);
    return info;
  } catch (error) {
    console.error('Failed to send email:', error);
    throw error;
  }
};

// Send QR code email for TOTP setup with validation
const sendQRCodeEmail = async (secret, uri, recipient) => {
  // Validate inputs
  if (!recipient || typeof recipient !== 'string' || recipient.trim() === '') {
    throw new Error('Valid recipient email address is required for QR code email');
  }

  if (!secret || typeof secret !== 'string') {
    throw new Error('Valid secret key is required for QR code email');
  }

  const subject = "Your TOTP Authentication Setup - Financial AI Hub";
  const message = `
    <h3>Welcome to Financial AI Hub!</h3>
    <p>Your account has been created successfully. To complete the setup, please configure Two-Factor Authentication (2FA):</p>
    
    <div style="background-color: #e8f4fd; padding: 15px; border-left: 4px solid #007bff; margin: 20px 0;">
      <h4>Setup Instructions:</h4>
      <ol>
        <li>Download Google Authenticator or Microsoft Authenticator on your mobile device</li>
        <li>Open the app and scan the QR code (available in your account after login)</li>
        <li>Alternatively, manually enter this secret key: <strong>${secret}</strong></li>
        <li>Use the 6-digit code from your authenticator app to complete login</li>
      </ol>
    </div>
    
    <p><strong>Security Note:</strong> Keep your secret key safe and do not share it with anyone.</p>
    <p>If you need to regenerate your QR code, you can do so from your account settings.</p>
  `;
  
  return await sendEmail(subject, message, recipient.trim());
};

// Send password reset OTP email with validation
const sendPasswordResetOTP = async (otp, recipient) => {
  // Validate inputs
  if (!recipient || typeof recipient !== 'string' || recipient.trim() === '') {
    throw new Error('Valid recipient email address is required for OTP email');
  }

  if (!otp || typeof otp !== 'string') {
    throw new Error('Valid OTP is required for password reset email');
  }

  const subject = "Password Reset OTP - Financial AI Hub";
  const message = `
    <h3>Password Reset Request</h3>
    <p>We received a request to reset your password for your Financial AI Hub account.</p>
    
    <div style="background-color: #fff3cd; padding: 20px; border-left: 4px solid #ffc107; margin: 20px 0; text-align: center;">
      <h2 style="color: #856404; margin: 0; font-size: 32px; letter-spacing: 3px;">${otp}</h2>
      <p style="color: #856404; margin: 10px 0 0 0; font-size: 14px;">This OTP is valid for 10 minutes</p>
    </div>
    
    <div style="background-color: #f8f9fa; padding: 15px; border-radius: 5px; margin: 20px 0;">
      <h4 style="color: #495057; margin-top: 0;">Instructions:</h4>
      <ol style="color: #6c757d; line-height: 1.6;">
        <li>Enter this OTP on the password reset page</li>
        <li>Create a new strong password</li>
        <li>Your account will be updated with the new password</li>
      </ol>
    </div>
    
    <div style="background-color: #f8d7da; padding: 15px; border-left: 4px solid #dc3545; margin: 20px 0;">
      <p style="color: #721c24; margin: 0;"><strong>Security Alert:</strong> If you did not request this password reset, please ignore this email and contact support immediately.</p>
    </div>
    
    <p style="color: #6c757d; font-size: 14px;">This OTP will expire in 10 minutes for security reasons.</p>
  `;
  
  return await sendEmail(subject, message, recipient.trim());
};

// Send password recovery email with validation
const sendRecoveryEmail = async (secret, uri, recipient, username) => {
  // Validate inputs
  if (!recipient || typeof recipient !== 'string' || recipient.trim() === '') {
    throw new Error('Valid recipient email address is required for recovery email');
  }

  if (!secret || typeof secret !== 'string') {
    throw new Error('Valid secret key is required for recovery email');
  }

  if (!username || typeof username !== 'string') {
    throw new Error('Valid username is required for recovery email');
  }

  const subject = "Account Recovery - Financial AI Hub";
  const message = `
    <h3>Account Recovery Request</h3>
    <p>Hello <strong>${username}</strong>,</p>
    <p>We received a request to recover your account. Your Two-Factor Authentication has been reset.</p>
    
    <div style="background-color: #fff3cd; padding: 15px; border-left: 4px solid #ffc107; margin: 20px 0;">
      <h4>New TOTP Setup:</h4>
      <p>Your previous authenticator setup has been invalidated for security reasons.</p>
      <p><strong>New Secret Key:</strong> ${secret}</p>
      <ol>
        <li>Remove the old entry from your authenticator app</li>
        <li>Add a new entry using the secret key above or scan the new QR code</li>
        <li>Use the new 6-digit code to login</li>
      </ol>
    </div>
    
    <p><strong>Security Alert:</strong> If you did not request this recovery, please contact support immediately.</p>
  `;
  
  return await sendEmail(subject, message, recipient.trim());
};

module.exports = {
  sendEmail,
  sendQRCodeEmail,
  sendPasswordResetOTP,
  sendRecoveryEmail,
  testEmailConnection
};
