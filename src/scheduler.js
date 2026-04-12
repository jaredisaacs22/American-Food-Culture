#!/usr/bin/env node

/**
 * American Food Culture — Automated Post Scheduler
 *
 * Runs on a cron schedule and automatically:
 *   1. Picks the next unposted food story
 *   2. Generates platform-specific content via Claude
 *   3. Posts to Twitter/X (thread format)
 *   4. Logs results
 *
 * Instagram posts require a manual image upload step,
 * so the scheduler generates the caption + image prompt
 * and saves them to output/ for manual review.
 *
 * Usage:
 *   node src/scheduler.js          Start the scheduler
 *   CRON_SCHEDULE="0 10 * * *"     Post at 10am daily (default)
 *   TIMEZONE="America/New_York"    Timezone (default)
 */

require('dotenv').config();

const cron = require('node-cron');
const fs = require('fs');
const path = require('path');
const { env, validateEnv } = require('./config/env');
const brand = require('./config/brand');
const { pickNextStory, recordPost } = require('./utils/story-picker');
const { generateInstagramPost, generateTwitterPost } = require('./generators/story-generator');
const { generateImagePrompt, generateGraphicSpec } = require('./generators/image-prompt-generator');
const { postThread, parseThread } = require('./platforms/twitter');

const OUTPUT_DIR = path.join(__dirname, '..', 'output');

function ensureOutputDir() {
  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  }
}

async function runPostCycle() {
  const timestamp = new Date().toISOString();
  console.log(`\n[${ timestamp }] Starting post cycle...`);

  try {
    const story = pickNextStory();
    console.log(`Selected story: ${story.dish} (${story.id})`);

    // Generate content for both platforms in parallel
    const [igCaption, twThread, imgPrompt] = await Promise.all([
      generateInstagramPost(story),
      generateTwitterPost(story),
      generateImagePrompt(story),
    ]);

    // Post to Twitter automatically
    try {
      validateEnv(['twitter']);
      const tweets = parseThread(twThread);
      const result = await postThread(tweets);
      recordPost(story.id, 'twitter', result.tweetIds[0]);
      console.log(`  ✅ Twitter thread posted (${tweets.length} tweets)`);
    } catch (err) {
      console.error(`  ❌ Twitter post failed: ${err.message}`);
    }

    // Save Instagram content for manual review + image creation
    ensureOutputDir();
    const dateStr = new Date().toISOString().split('T')[0];
    const outputFile = path.join(OUTPUT_DIR, `${dateStr}_${story.id}.json`);

    const output = {
      date: timestamp,
      story: {
        id: story.id,
        dish: story.dish,
        category: story.category,
      },
      instagram: {
        caption: igCaption,
        imagePrompt: imgPrompt,
        graphicSpec: generateGraphicSpec(story),
        status: 'pending_image',
      },
      twitter: {
        thread: twThread,
        status: 'posted',
      },
    };

    fs.writeFileSync(outputFile, JSON.stringify(output, null, 2));
    console.log(`  📁 Instagram content saved to: ${outputFile}`);
    console.log(`     Create the image using the prompt, then post manually or via API.`);

    console.log(`\n  Post cycle complete for: ${story.dish}\n`);
  } catch (err) {
    console.error(`  ❌ Post cycle failed: ${err.message}`);
    console.error(err.stack);
  }
}

// Start scheduler
console.log(`\n🇺🇸  ${brand.name} — Scheduler`);
console.log(`${'═'.repeat(50)}`);
console.log(`Schedule: ${env.schedule.cron}`);
console.log(`Timezone: ${env.schedule.timezone}`);
console.log(`Started at: ${new Date().toISOString()}\n`);
console.log('Waiting for next scheduled run... (Ctrl+C to stop)\n');

cron.schedule(env.schedule.cron, runPostCycle, {
  timezone: env.schedule.timezone,
});

// Also expose for manual trigger
module.exports = { runPostCycle };
