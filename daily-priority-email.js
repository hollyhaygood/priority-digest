#!/usr/bin/env node

/**
 * Daily Priority Email Digest
 * Runs daily and sends you a prioritized to-do list via email
 * 
 * Setup:
 * 1. npm install anthropic node-cron dotenv nodemailer
 * 2. Create .env file with your API key
 * 3. Run: node daily-priority-email.js
 */

require('dotenv').config();
const Anthropic = require('@anthropic-ai/sdk');
const nodemailer = require('nodemailer');
const cron = require('node-cron');

const client = new Anthropic();

// Configure Gmail (using App Password for security)
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.GMAIL_USER,
    pass: process.env.GMAIL_APP_PASSWORD
  }
});

async function generatePriorities() {
  console.log(`[${new Date().toISOString()}] Generating priorities...`);

  try {
    const response = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 2000,
      system: `You are a productivity expert analyzing work requests and communications.

Return ONLY a valid JSON object (no markdown, no code fence) with this structure:
{
  "daily": [{"task": "description", "priority": "high|medium|low", "source": "gmail|slack|calendar|drive", "reason": "why", "timeEstimate": "15min|30min|1hr|2hr+"}],
  "weekly": [{"task": "description", "priority": "high|medium|low", "source": "gmail|slack|calendar|drive", "reason": "why", "timeEstimate": "varies"}],
  "blockers": ["blocker 1"],
  "summary": "2-3 sentence summary of workload"
}

Rules:
- HIGH: urgent deadlines, blocking others, critical requests
- MEDIUM: this week, important but not urgent
- LOW: nice-to-have, flexible
- Max 5 items for daily, rest in weekly
- Remove duplicates`,
      messages: [
        {
          role: 'user',
          content: `Generate my daily priority digest. Review my:
- Gmail (unread, starred, from key people)
- Slack (DMs, mentions, last 48hrs)
- Google Calendar (today, meetings, prep needed)
- Google Drive (comments mentioning me, shared files awaiting input, tagged items)

Return ONLY valid JSON.`
        }
      ]
    });

    // Extract JSON from response
    const responseText = response.content[0].type === 'text' ? response.content[0].text : '';
    const jsonMatch = responseText.match(/\{[\s\S]*\}/);
    
    if (!jsonMatch) {
      throw new Error('Could not parse JSON from response');
    }

    const priorities = JSON.parse(jsonMatch[0]);
    console.log('✓ Priorities generated successfully');
    return priorities;

  } catch (error) {
    console.error('Error generating priorities:', error.message);
    throw error;
  }
}

function buildEmailHTML(priorities) {
  const formatTasks = (tasks) => {
    if (!tasks || tasks.length === 0) return '<p style="color: #666; font-style: italic;">No tasks for this period</p>';
    
    return tasks.map(task => `
      <div style="margin-bottom: 16px; padding: 12px; border-left: 4px solid ${
        task.priority === 'high' ? '#ef4444' : task.priority === 'medium' ? '#f59e0b' : '#3b82f6'
      }; background: ${
        task.priority === 'high' ? '#fef2f2' : task.priority === 'medium' ? '#fffbeb' : '#eff6ff'
      };">
        <div style="display: flex; justify-content: space-between; align-items: start; margin-bottom: 8px;">
          <strong style="color: #1f2937; font-size: 16px;">${task.task}</strong>
          <span style="background: ${
            task.priority === 'high' ? '#fee2e2' : task.priority === 'medium' ? '#fef3c7' : '#dbeafe'
          }; color: ${
            task.priority === 'high' ? '#991b1b' : task.priority === 'medium' ? '#92400e' : '#1e40af'
          }; padding: 4px 12px; border-radius: 12px; font-size: 12px; font-weight: 600; text-transform: uppercase; white-space: nowrap; margin-left: 12px;">
            ${task.priority}
          </span>
        </div>
        <p style="color: #666; font-size: 14px; margin: 8px 0;">📌 ${task.reason}</p>
        <div style="display: flex; justify-content: space-between; font-size: 12px; color: #999;">
          <span>⏱️ ${task.timeEstimate}</span>
          <span>📍 ${task.source}</span>
        </div>
      </div>
    `).join('');
  };

  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <style>
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; color: #1f2937; line-height: 1.6; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { background: linear-gradient(135deg, #1e40af 0%, #4f46e5 100%); color: white; padding: 24px; border-radius: 8px; margin-bottom: 24px; }
        .header h1 { margin: 0; font-size: 24px; }
        .header p { margin: 8px 0 0 0; opacity: 0.9; font-size: 14px; }
        .section { margin-bottom: 32px; }
        .section h2 { color: #1f2937; font-size: 18px; margin: 0 0 16px 0; border-bottom: 2px solid #e5e7eb; padding-bottom: 8px; }
        .section h2.high { border-color: #ef4444; }
        .section h2.medium { border-color: #f59e0b; }
        .blockers { background: #fef3c7; border-left: 4px solid #f59e0b; padding: 16px; border-radius: 4px; margin-bottom: 24px; }
        .blockers h3 { color: #92400e; margin: 0 0 8px 0; }
        .blockers ul { margin: 0; padding-left: 20px; color: #b45309; }
        .summary { background: #f0f9ff; border-left: 4px solid #0284c7; padding: 16px; border-radius: 4px; margin-bottom: 24px; }
        .summary h3 { color: #0c4a6e; margin: 0 0 8px 0; }
        .summary p { margin: 0; color: #075985; font-size: 14px; line-height: 1.6; }
        .footer { border-top: 1px solid #e5e7eb; padding-top: 16px; font-size: 12px; color: #999; text-align: center; }
        .footer a { color: #3b82f6; text-decoration: none; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1>📋 Your Daily Priorities</h1>
          <p>${new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</p>
        </div>

        ${priorities.summary ? `
          <div class="summary">
            <h3>📊 Workload Summary</h3>
            <p>${priorities.summary}</p>
          </div>
        ` : ''}

        ${priorities.blockers && priorities.blockers.length > 0 ? `
          <div class="blockers">
            <h3>⚠️ Blockers & Dependencies</h3>
            <ul>
              ${priorities.blockers.map(b => `<li>${b}</li>`).join('')}
            </ul>
          </div>
        ` : ''}

        <div class="section">
          <h2 class="high">🔴 TODAY (${priorities.daily?.length || 0} items)</h2>
          ${formatTasks(priorities.daily)}
        </div>

        <div class="section">
          <h2 class="medium">📅 THIS WEEK (${priorities.weekly?.length || 0} items)</h2>
          ${formatTasks(priorities.weekly)}
        </div>

        <div class="footer">
          <p>
            Generated by <a href="https://claude.ai">Claude</a> using your Gmail, Slack, Calendar, and Drive.
            <br>Reply to this email or update your settings to customize.
          </p>
        </div>
      </div>
    </body>
    </html>
  `;

  return html;
}

async function sendEmail(html, subject = '📋 Your Daily Priorities') {
  console.log(`[${new Date().toISOString()}] Sending email...`);

  try {
    const info = await transporter.sendMail({
      from: process.env.GMAIL_USER,
      to: process.env.EMAIL_RECIPIENT || process.env.GMAIL_USER,
      subject: subject,
      html: html,
      headers: {
        'X-Priority': '3',
        'X-Mailer': 'Claude Priority Digest'
      }
    });

    console.log(`✓ Email sent successfully (ID: ${info.messageId})`);
    return true;
  } catch (error) {
    console.error('Error sending email:', error.message);
    throw error;
  }
}

async function runDigest() {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`Daily Priority Digest - ${new Date().toISOString()}`);
  console.log(`${'='.repeat(60)}\n`);

  try {
    const priorities = await generatePriorities();
    const html = buildEmailHTML(priorities);
    await sendEmail(html);
    console.log('\n✓ Daily digest complete!\n');
  } catch (error) {
    console.error('\n✗ Daily digest failed:', error.message, '\n');
    // Optionally send error notification email
  }
}

// Schedule to run daily at specified time (default: 7am)
const scheduleTime = process.env.SCHEDULE_TIME || '0 7 * * *'; // Cron format: minute hour day month dayOfWeek

console.log(`Starting Daily Priority Digest`);
console.log(`Scheduled to run at: ${scheduleTime}`);
console.log(`Sending to: ${process.env.EMAIL_RECIPIENT || process.env.GMAIL_USER}`);
console.log(`Type 'q' to quit\n`);

// Run immediately on startup (optional - comment out to only run on schedule)
// runDigest();

// Schedule recurring task
cron.schedule(scheduleTime, () => {
  runDigest();
});

// Handle graceful shutdown
process.on('SIGINT', () => {
  console.log('\nShutting down gracefully...');
  process.exit(0);
});
