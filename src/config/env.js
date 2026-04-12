require('dotenv').config();

const env = {
  anthropic: {
    apiKey: process.env.ANTHROPIC_API_KEY,
  },
  instagram: {
    accessToken: process.env.INSTAGRAM_ACCESS_TOKEN,
    accountId: process.env.INSTAGRAM_ACCOUNT_ID,
  },
  twitter: {
    apiKey: process.env.TWITTER_API_KEY,
    apiSecret: process.env.TWITTER_API_SECRET,
    accessToken: process.env.TWITTER_ACCESS_TOKEN,
    accessSecret: process.env.TWITTER_ACCESS_SECRET,
  },
  cloudinary: {
    cloudName: process.env.CLOUDINARY_CLOUD_NAME,
    apiKey: process.env.CLOUDINARY_API_KEY,
    apiSecret: process.env.CLOUDINARY_API_SECRET,
  },
  schedule: {
    cron: process.env.CRON_SCHEDULE || '0 10 * * *',
    timezone: process.env.TIMEZONE || 'America/New_York',
  },
};

function validateEnv(platforms) {
  const missing = [];

  if (!env.anthropic.apiKey) missing.push('ANTHROPIC_API_KEY');

  if (platforms.includes('instagram')) {
    if (!env.instagram.accessToken) missing.push('INSTAGRAM_ACCESS_TOKEN');
    if (!env.instagram.accountId) missing.push('INSTAGRAM_ACCOUNT_ID');
  }

  if (platforms.includes('twitter')) {
    if (!env.twitter.apiKey) missing.push('TWITTER_API_KEY');
    if (!env.twitter.apiSecret) missing.push('TWITTER_API_SECRET');
    if (!env.twitter.accessToken) missing.push('TWITTER_ACCESS_TOKEN');
    if (!env.twitter.accessSecret) missing.push('TWITTER_ACCESS_SECRET');
  }

  if (missing.length > 0) {
    console.error(`Missing required environment variables:\n  ${missing.join('\n  ')}`);
    console.error('\nCopy .env.example to .env and fill in your credentials.');
    process.exit(1);
  }
}

module.exports = { env, validateEnv };
