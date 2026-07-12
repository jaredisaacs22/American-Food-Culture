#!/usr/bin/env node

/**
 * American Food Culture — Fully Automated Scheduler
 *
 * Two-phase pipeline for reliability:
 *   Phase 1 (FILL):  Generate content + images ahead of time → queue/
 *   Phase 2 (POST):  Post from queue → Instagram + Twitter → queue/posted/
 *
 * Both phases run on cron schedules. If generation fails,
 * posting still works from the pre-filled queue.
 *
 * Usage:
 *   node src/scheduler.js                Start the scheduler
 *   node src/scheduler.js --fill-now     Fill queue immediately then start
 *   node src/scheduler.js --post-now     Post one item from queue then start
 */

require('dotenv').config();

const cron = require('node-cron');
const { env, validateEnv } = require('./config/env');
const brand = require('./config/brand');
const { pickNextStory, recordPost } = require('./utils/story-picker');
const { generateInstagramPost, generateTwitterPost } = require('./generators/story-generator');
const { generateImagePrompt } = require('./generators/image-prompt-generator');
const { generateImage, downloadImage } = require('./platforms/image-generator');
const { postToInstagram, uploadImageToCloudinary } = require('./platforms/instagram');
const { postThread, postThreadWithImage, parseThread } = require('./platforms/twitter');
const { enqueue, dequeue, markPosted, markFailed, queueSize } = require('./utils/content-queue');
const { refreshInstagramToken, initializeToken } = require('./utils/token-refresh');

// ─── Phase 1: Fill Queue ───────────────────────────────────────────────────────

async function fillQueue() {
  const timestamp = new Date().toISOString();
  console.log(`\n[${timestamp}] FILL QUEUE — Generating content...`);

  try {
    const story = pickNextStory();
    console.log(`  Story: ${story.dish} (${story.id})`);

    // Generate all content in parallel
    const [igCaption, twThread, imgPrompt] = await Promise.all([
      generateInstagramPost(story),
      generateTwitterPost(story),
      generateImagePrompt(story),
    ]);

    // Generate the actual image via DALL-E
    console.log('  Generating image via DALL-E...');
    const { imageUrl: dalleUrl, revisedPrompt } = await generateImage(imgPrompt);

    // Download locally as backup + for Twitter upload
    const dateStr = new Date().toISOString().split('T')[0];
    const localImage = await downloadImage(dalleUrl, `${dateStr}_${story.id}.png`);

    // Upload to Cloudinary for a persistent public URL (Instagram needs this)
    console.log('  Uploading to Cloudinary for persistence...');
    const publicImageUrl = await uploadImageToCloudinary(localImage);

    // Package and queue
    const contentPackage = {
      story: { id: story.id, dish: story.dish, category: story.category },
      instagram: { caption: igCaption, imageUrl: publicImageUrl },
      twitter: { thread: twThread, localImagePath: localImage },
      image: { prompt: imgPrompt, revisedPrompt, publicUrl: publicImageUrl, localPath: localImage },
    };

    enqueue(contentPackage);
    console.log(`  ✅ Queue filled. Current queue size: ${queueSize()}\n`);
  } catch (err) {
    console.error(`  ❌ Fill failed: ${err.message}`);
    if (err.response?.data) {
      console.error('  API response:', JSON.stringify(err.response.data, null, 2));
    }
  }
}

// ─── Phase 2: Post From Queue ──────────────────────────────────────────────────

async function postFromQueue() {
  const timestamp = new Date().toISOString();
  console.log(`\n[${timestamp}] POST — Publishing from queue...`);

  const item = dequeue();
  if (!item) {
    console.log('  ⚠️  Queue is empty! Run fill first.');
    // Try to fill on-the-fly as fallback
    console.log('  Attempting on-the-fly generation...');
    await fillQueue();
    const freshItem = dequeue();
    if (!freshItem) {
      console.error('  ❌ Still no content available. Skipping this cycle.');
      return;
    }
    return postItem(freshItem);
  }

  return postItem(item);
}

async function postItem(item) {
  const results = {};

  // Refresh Instagram token if needed
  try {
    await refreshInstagramToken();
  } catch (err) {
    console.warn(`  [Token] Refresh check failed: ${err.message}`);
  }

  // Post to Instagram
  try {
    validateEnv(['instagram']);
    console.log(`  Posting to Instagram: ${item.story.dish}...`);
    const igResult = await postToInstagram({
      imageUrl: item.instagram.imageUrl,
      caption: item.instagram.caption,
    });
    results.instagram = { success: true, postId: igResult.postId };
    recordPost(item.story.id, 'instagram', igResult.postId);
    console.log(`  ✅ Instagram posted! ID: ${igResult.postId}`);
  } catch (err) {
    results.instagram = { success: false, error: err.message };
    console.error(`  ❌ Instagram failed: ${err.message}`);
  }

  // Post to Twitter
  try {
    validateEnv(['twitter']);
    console.log(`  Posting to Twitter: ${item.story.dish}...`);
    const tweets = parseThread(item.twitter.thread);

    let twResult;
    if (item.twitter.localImagePath) {
      twResult = await postThreadWithImage({
        tweets,
        imagePath: item.twitter.localImagePath,
      });
    } else {
      twResult = await postThread(tweets);
    }

    results.twitter = { success: true, tweetIds: twResult.tweetIds };
    recordPost(item.story.id, 'twitter', twResult.tweetIds[0]);
    console.log(`  ✅ Twitter thread posted! (${twResult.tweetIds.length} tweets)`);
  } catch (err) {
    results.twitter = { success: false, error: err.message };
    console.error(`  ❌ Twitter failed: ${err.message}`);
  }

  // Determine overall success
  const anySuccess = Object.values(results).some(r => r.success);
  if (anySuccess) {
    markPosted(item, results);
  } else {
    markFailed(item, results);
  }

  console.log(`  Post cycle complete for: ${item.story.dish}\n`);
}

// ─── Startup ───────────────────────────────────────────────────────────────────

async function start() {
  console.log(`\n🇺🇸  ${brand.name} — Automated Scheduler`);
  console.log(`${'═'.repeat(50)}`);
  console.log(`Fill schedule:  ${env.schedule.fillCron}  (generate content)`);
  console.log(`Post schedule:  ${env.schedule.postCron}  (publish to platforms)`);
  console.log(`Timezone:       ${env.schedule.timezone}`);
  console.log(`Queue size:     ${queueSize()} items ready`);
  console.log(`Started at:     ${new Date().toISOString()}\n`);

  // Initialize token tracking
  initializeToken();

  // Handle CLI flags
  const args = process.argv.slice(2);
  if (args.includes('--fill-now')) {
    console.log('Running immediate fill...\n');
    await fillQueue();
  }
  if (args.includes('--post-now')) {
    console.log('Running immediate post...\n');
    await postFromQueue();
  }

  // Schedule Phase 1: Fill queue (early morning, ahead of post time)
  cron.schedule(env.schedule.fillCron, fillQueue, {
    timezone: env.schedule.timezone,
  });

  // Schedule Phase 2: Post from queue
  cron.schedule(env.schedule.postCron, postFromQueue, {
    timezone: env.schedule.timezone,
  });

  console.log('Scheduler running. Ctrl+C to stop.\n');
}

start().catch(err => {
  console.error('Scheduler startup failed:', err.message);
  process.exit(1);
});

module.exports = { fillQueue, postFromQueue };
