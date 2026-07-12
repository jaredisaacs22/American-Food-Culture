const { TwitterApi } = require('twitter-api-v2');
const { env } = require('../config/env');

function getClient() {
  return new TwitterApi({
    appKey: env.twitter.apiKey,
    appSecret: env.twitter.apiSecret,
    accessToken: env.twitter.accessToken,
    accessSecret: env.twitter.accessSecret,
  });
}

/**
 * Post a single tweet
 */
async function postTweet(text) {
  const client = getClient();

  console.log('  [Twitter] Posting tweet...');
  const { data } = await client.v2.tweet(text);
  console.log(`  [Twitter] Posted! Tweet ID: ${data.id}`);

  return { tweetId: data.id, platform: 'twitter' };
}

/**
 * Post a tweet with an image
 */
async function postTweetWithImage({ text, imagePath }) {
  const client = getClient();

  console.log('  [Twitter] Uploading image...');
  const mediaId = await client.v1.uploadMedia(imagePath);

  console.log('  [Twitter] Posting tweet with image...');
  const { data } = await client.v2.tweet({
    text,
    media: { media_ids: [mediaId] },
  });

  console.log(`  [Twitter] Posted! Tweet ID: ${data.id}`);
  return { tweetId: data.id, platform: 'twitter' };
}

/**
 * Post a thread (array of tweet texts).
 * Each tweet is posted as a reply to the previous one.
 */
async function postThread(tweets) {
  const client = getClient();
  const results = [];

  console.log(`  [Twitter] Posting thread (${tweets.length} tweets)...`);

  let lastTweetId = null;
  for (let i = 0; i < tweets.length; i++) {
    const tweetData = lastTweetId
      ? { text: tweets[i], reply: { in_reply_to_tweet_id: lastTweetId } }
      : { text: tweets[i] };

    const { data } = await client.v2.tweet(tweetData);
    lastTweetId = data.id;
    results.push(data.id);
    console.log(`  [Twitter] Tweet ${i + 1}/${tweets.length} posted: ${data.id}`);
  }

  console.log('  [Twitter] Thread complete!');
  return { tweetIds: results, platform: 'twitter' };
}

/**
 * Post a thread with an image on the first tweet
 */
async function postThreadWithImage({ tweets, imagePath }) {
  const client = getClient();
  const results = [];

  console.log(`  [Twitter] Posting thread with image (${tweets.length} tweets)...`);

  // Upload image for the first tweet
  const mediaId = await client.v1.uploadMedia(imagePath);

  // Post first tweet with image
  const { data: first } = await client.v2.tweet({
    text: tweets[0],
    media: { media_ids: [mediaId] },
  });
  results.push(first.id);
  console.log(`  [Twitter] Tweet 1/${tweets.length} posted: ${first.id}`);

  // Post remaining tweets as replies
  let lastTweetId = first.id;
  for (let i = 1; i < tweets.length; i++) {
    const { data } = await client.v2.tweet({
      text: tweets[i],
      reply: { in_reply_to_tweet_id: lastTweetId },
    });
    lastTweetId = data.id;
    results.push(data.id);
    console.log(`  [Twitter] Tweet ${i + 1}/${tweets.length} posted: ${data.id}`);
  }

  console.log('  [Twitter] Thread complete!');
  return { tweetIds: results, platform: 'twitter' };
}

/**
 * Parse a generated thread string into individual tweets.
 * Expects format: "1/ tweet text\n\n2/ tweet text\n\n..."
 */
function parseThread(threadText) {
  return threadText
    .split(/\n\s*\n/)
    .map(t => t.replace(/^\d+\/\s*/, '').trim())
    .filter(t => t.length > 0 && t.length <= 280);
}

module.exports = {
  postTweet,
  postTweetWithImage,
  postThread,
  postThreadWithImage,
  parseThread,
};
