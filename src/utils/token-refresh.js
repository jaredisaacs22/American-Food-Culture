const axios = require('axios');
const fs = require('fs');
const path = require('path');
const { env } = require('../config/env');
const { retry } = require('./retry');

const TOKEN_FILE = path.join(__dirname, '..', '..', '.instagram-token.json');

/**
 * Auto-refresh Instagram long-lived token.
 * Tokens expire after 60 days — this refreshes them before expiry.
 * Call this on scheduler startup and periodically.
 */
async function refreshInstagramToken() {
  const tokenData = loadTokenData();

  if (!tokenData.accessToken) {
    console.log('  [Token] No stored token — using .env value');
    return env.instagram.accessToken;
  }

  const now = Date.now();
  const expiresAt = tokenData.expiresAt || 0;
  const daysUntilExpiry = (expiresAt - now) / (1000 * 60 * 60 * 24);

  // Refresh if within 7 days of expiry
  if (daysUntilExpiry > 7) {
    console.log(`  [Token] Instagram token valid for ${Math.floor(daysUntilExpiry)} more days`);
    return tokenData.accessToken;
  }

  console.log(`  [Token] Instagram token expires in ${Math.floor(daysUntilExpiry)} days — refreshing...`);

  try {
    const response = await retry(() =>
      axios.get('https://graph.facebook.com/v21.0/oauth/access_token', {
        params: {
          grant_type: 'fb_exchange_token',
          client_id: env.instagram.appId,
          client_secret: env.instagram.appSecret,
          fb_exchange_token: tokenData.accessToken,
        },
        timeout: 15000,
      }),
      { attempts: 3, delayMs: 3000, label: 'Token refresh' }
    );

    const newToken = response.data.access_token;
    const expiresIn = response.data.expires_in || 5184000; // default 60 days

    saveTokenData({
      accessToken: newToken,
      expiresAt: now + expiresIn * 1000,
      refreshedAt: new Date().toISOString(),
    });

    // Also update the runtime env
    env.instagram.accessToken = newToken;

    console.log(`  [Token] Instagram token refreshed! Valid for ${Math.floor(expiresIn / 86400)} days`);
    return newToken;
  } catch (err) {
    console.error(`  [Token] Failed to refresh: ${err.message}`);
    console.error('  [Token] Falling back to current token');
    return tokenData.accessToken || env.instagram.accessToken;
  }
}

/**
 * Initialize token tracking on first run.
 * Stores the .env token with a 60-day expiry estimate.
 */
function initializeToken() {
  if (fs.existsSync(TOKEN_FILE)) return;

  if (env.instagram.accessToken) {
    saveTokenData({
      accessToken: env.instagram.accessToken,
      // Assume fresh — 60 days from now
      expiresAt: Date.now() + 60 * 24 * 60 * 60 * 1000,
      refreshedAt: new Date().toISOString(),
    });
    console.log('  [Token] Initialized token tracking (assumed 60-day expiry)');
  }
}

function loadTokenData() {
  if (!fs.existsSync(TOKEN_FILE)) return {};
  return JSON.parse(fs.readFileSync(TOKEN_FILE, 'utf-8'));
}

function saveTokenData(data) {
  fs.writeFileSync(TOKEN_FILE, JSON.stringify(data, null, 2));
}

module.exports = { refreshInstagramToken, initializeToken };
