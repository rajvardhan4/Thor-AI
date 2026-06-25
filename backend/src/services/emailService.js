const nodemailer = require('nodemailer');

/**
 * Sends a welcome email to the newly registered user.
 * If SMTP configuration is missing, it falls back to console logging a simulated email.
 */
async function sendWelcomeEmail(email, fullName) {
  const subject = 'Welcome to THOR AI';
  const htmlContent = `
    <div style="font-family: monospace; background-color: #030712; color: #22d3ee; padding: 20px; border: 1px solid #06b6d4; border-radius: 8px; max-width: 600px; margin: 0 auto; box-shadow: 0 0 20px rgba(6, 182, 212, 0.15);">
      <h2 style="border-bottom: 1px solid rgba(6, 182, 212, 0.3); padding-bottom: 10px; color: #06b6d4; letter-spacing: 2px;">THOR AI INITIATED</h2>
      <p style="font-size: 14px; line-height: 1.6; color: #e2e8f0;">Hello <strong>${fullName}</strong>,</p>
      <p style="font-size: 14px; line-height: 1.6; color: #e2e8f0;">Your THOR AI account has been created successfully.</p>
      <p style="font-size: 14px; line-height: 1.6; color: #e2e8f0;">You can now sign in and start using your personal AI assistant.</p>
      <p style="font-size: 14px; line-height: 1.6; color: #e2e8f0;">Thank you for joining THOR AI.</p>
      <div style="margin-top: 30px; padding-top: 15px; border-top: 1px solid rgba(6, 182, 212, 0.2); font-size: 10px; color: #0891b2; text-align: center;">
        SECURED BY MATRIX INTEGRATION LAYER | SYSTEM VERSION 5.00
      </div>
    </div>
  `;

  const textContent = `Hello ${fullName},\n\nYour THOR AI account has been created successfully.\n\nYou can now sign in and start using your personal AI assistant.\n\nThank you for joining THOR AI.`;

  // Check if SMTP is configured
  const host = process.env.SMTP_HOST;
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  const port = process.env.SMTP_PORT || 587;

  if (host && user && pass) {
    try {
      const transporter = nodemailer.createTransport({
        host,
        port: parseInt(port),
        secure: parseInt(port) === 465,
        auth: { user, pass }
      });

      const info = await transporter.sendMail({
        from: `"THOR AI" <${user}>`,
        to: email,
        subject: subject,
        text: textContent,
        html: htmlContent
      });

      console.log(`Welcome email successfully sent to ${email} (MessageID: ${info.messageId})`);
      return true;
    } catch (err) {
      console.error(`Failed to send welcome email via SMTP to ${email}:`, err);
      // Fallback to mock log so signup doesn't block
    }
  }

  // Fallback Mock Email Log
  console.log('\n=================== SIMULATED WELCOME EMAIL ===================');
  console.log(`TO: ${email}`);
  console.log(`SUBJECT: ${subject}`);
  console.log(`BODY:\n${textContent}`);
  console.log('===============================================================\n');
  return true;
}

module.exports = {
  sendWelcomeEmail
};
