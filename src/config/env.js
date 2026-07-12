require('dotenv').config();

const env = {
  anthropic: {
    apiKey: process.env.ANTHROPIC_API_KEY,
  },
  openai: {
    apiKey: process.env.OPENAI_API_KEY,
  },
  instagram: {
    accessToken: process.env.INSTAGRAM_ACCESS_TOKEN,
    accountId: process.env.INSTAGRAM_ACCOUNT_ID,
    appId: process.env.FACEBOOK_APP_ID,
    appSecret: process.env.FACEBOOK_APP_SECRET,
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
    fillCron: process.env.FILL_CRON_SCHEDULE || '0 7 * * *',
    postCron: process.env.POST_CRON_SCHEDULE || '0 10 * * *',
    timezone: process.env.TIMEZONE || 'America/New_York',
  },
};

function validateEnv(platforms) {
  const missing = [];

  if (platforms.includes('generate') || platforms.length === 0) {
    if (!env.anthropic.apiKey) missing.push('ANTHROPIC_API_KEY');
  }

  if (platforms.includes('image')) {
    if (!env.openai.apiKey) missing.push('OPENAI_API_KEY');
  }

  if (platforms.includes('instagram')) {
    if (!env.instagram.accessToken) missing.push('INSTAGRAM_ACCESS_TOKEN');
    if (!env.instagram.accountId) missing.push('INSTAGRAM_ACCOUNT_ID');
    if (!env.cloudinary.cloudName) missing.push('CLOUDINARY_CLOUD_NAME');
    if (!env.cloudinary.apiKey) missing.push('CLOUDINARY_API_KEY');
    if (!env.cloudinary.apiSecret) missing.push('CLOUDINARY_API_SECRET');
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
