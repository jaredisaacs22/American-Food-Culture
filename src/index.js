#!/usr/bin/env node

/**
 * American Food Culture — Social Media Content Pipeline CLI
 *
 * COMMANDS:
 *   node src/index.js stories                     List all food stories
 *   node src/index.js generate [story-id]         Preview generated content
 *   node src/index.js post all [story-id]         Full pipeline: generate + image + post everywhere
 *   node src/index.js post instagram [story-id]   Generate + post to Instagram only
 *   node src/index.js post twitter [story-id]     Generate + post to Twitter only
 *   node src/index.js queue fill [count]          Pre-generate content into the queue
 *   node src/index.js queue post                  Post next item from queue
 *   node src/index.js queue status                Show queue status
 *   node src/index.js image-prompt [story-id]     Generate retro image prompt only
 */

require('dotenv').config();

const { validateEnv } = require('./config/env');
const brand = require('./config/brand');
const { loadStories, pickNextStory, pickStoryById, recordPost } = require('./utils/story-picker');
const { generateInstagramPost, generateTwitterPost } = require('./generators/story-generator');
const { generateImagePrompt, generateGraphicSpec } = require('./generators/image-prompt-generator');
const { generateImage, downloadImage } = require('./platforms/image-generator');
const { postToInstagram, uploadImageToCloudinary } = require('./platforms/instagram');
const { postThread, postThreadWithImage, parseThread } = require('./platforms/twitter');
const { enqueue, dequeue, markPosted, markFailed, queueSize } = require('./utils/content-queue');

const [,, command, ...args] = process.argv;

async function main() {
  console.log(`\n🇺🇸  ${brand.name} — Content Pipeline\n${'═'.repeat(50)}\n`);

  switch (command) {
    case 'stories':
      return listStories();
    case 'generate':
    case 'preview':
      return previewContent(args[0]);
    case 'post':
      return postContent(args[0], args[1]);
    case 'queue':
      return handleQueue(args[0], args[1]);
    case 'image-prompt':
      return showImagePrompt(args[0]);
    default:
      printUsage();
  }
}

function printUsage() {
  console.log(`Commands:
  stories                     List all food stories
  generate [story-id]         Preview content (no posting)
  post all [story-id]         Full auto: generate + image + post to Instagram & Twitter
  post instagram [story-id]   Post to Instagram only
  post twitter [story-id]     Post to Twitter only
  queue fill [count]          Pre-generate content into the queue
  queue post                  Post next item from queue
  queue status                Show queue status
  image-prompt [story-id]     Generate image prompt only

If no story-id is given, the next unposted story is picked automatically.
`);
}

function listStories() {
  const stories = loadStories();
  console.log(`Available stories (${stories.length}):\n`);
  for (const s of stories) {
    const tag = s.category === 'americanized' ? '[AMERICANIZED]' : '[ORIGIN]      ';
    console.log(`  ${tag}  ${s.id.padEnd(25)} ${s.dish}`);
  }
  console.log(`\nUse: node src/index.js generate <story-id>\n`);
}

// ─── Preview (no posting) ──────────────────────────────────────────────────────

async function previewContent(storyId) {
  validateEnv([]);

  const story = storyId ? pickStoryById(storyId) : pickNextStory();
  console.log(`Story: ${story.dish} (${story.id})\n${'─'.repeat(50)}`);

  console.log('\n📸 INSTAGRAM CAPTION:\n');
  const igPost = await generateInstagramPost(story);
  console.log(igPost);

  console.log(`\n${'─'.repeat(50)}\n🐦 TWITTER THREAD:\n`);
  const twPost = await generateTwitterPost(story);
  console.log(twPost);

  console.log(`\n${'─'.repeat(50)}\n🎨 IMAGE PROMPT:\n`);
  const imgPrompt = await generateImagePrompt(story);
  console.log(imgPrompt);

  console.log(`\n${'═'.repeat(50)}\nPreview complete. Use "post all" to publish.\n`);
}

// ─── Full Automated Posting ────────────────────────────────────────────────────

async function postContent(platform, storyId) {
  const platforms = platform === 'all' ? ['instagram', 'twitter'] : [platform];

  if (!platforms.every(p => ['instagram', 'twitter'].includes(p))) {
    console.error(`Unknown platform: "${platform}". Use: instagram, twitter, or all`);
    process.exit(1);
  }

  validateEnv([...platforms, 'image']);

  const story = storyId ? pickStoryById(storyId) : pickNextStory();
  console.log(`Story: ${story.dish} (${story.id})\n`);

  // Step 1: Generate content
  console.log('Generating content...');
  const [igCaption, twThread, imgPrompt] = await Promise.all([
    platforms.includes('instagram') ? generateInstagramPost(story) : null,
    platforms.includes('twitter') ? generateTwitterPost(story) : null,
    generateImagePrompt(story),
  ]);

  // Step 2: Generate image
  console.log('\nGenerating retro image via DALL-E...');
  const { imageUrl: dalleUrl } = await generateImage(imgPrompt);

  // Step 3: Download + upload for persistence
  const dateStr = new Date().toISOString().split('T')[0];
  const localImage = await downloadImage(dalleUrl, `${dateStr}_${story.id}.png`);

  let publicImageUrl;
  if (platforms.includes('instagram')) {
    console.log('\nUploading image to Cloudinary...');
    publicImageUrl = await uploadImageToCloudinary(localImage);
    console.log(`  Public URL: ${publicImageUrl}`);
  }

  // Step 4: Post to platforms
  for (const p of platforms) {
    console.log(`\nPosting to ${p.toUpperCase()}...`);
    try {
      if (p === 'instagram') {
        const result = await postToInstagram({ imageUrl: publicImageUrl, caption: igCaption });
        recordPost(story.id, 'instagram', result.postId);
        console.log(`  ✅ Instagram posted! ID: ${result.postId}`);
      }

      if (p === 'twitter') {
        const tweets = parseThread(twThread);
        const result = await postThreadWithImage({ tweets, imagePath: localImage });
        recordPost(story.id, 'twitter', result.tweetIds[0]);
        console.log(`  ✅ Twitter thread posted! (${result.tweetIds.length} tweets)`);
      }
    } catch (err) {
      console.error(`  ❌ ${p} failed: ${err.message}`);
      if (err.response?.data) {
        console.error('  ', JSON.stringify(err.response.data));
      }
    }
  }

  console.log('\nDone!\n');
}

// ─── Queue Management ──────────────────────────────────────────────────────────

async function handleQueue(subcommand, countOrId) {
  switch (subcommand) {
    case 'fill':
      return fillQueueCommand(parseInt(countOrId) || 1);
    case 'post':
      return postFromQueueCommand();
    case 'status':
      return showQueueStatus();
    default:
      console.log('Queue commands: fill [count], post, status');
  }
}

async function fillQueueCommand(count) {
  validateEnv(['image']);
  console.log(`Filling queue with ${count} item(s)...\n`);

  for (let i = 0; i < count; i++) {
    const story = pickNextStory();
    console.log(`[${i + 1}/${count}] Generating: ${story.dish}...`);

    const [igCaption, twThread, imgPrompt] = await Promise.all([
      generateInstagramPost(story),
      generateTwitterPost(story),
      generateImagePrompt(story),
    ]);

    const { imageUrl: dalleUrl } = await generateImage(imgPrompt);
    const dateStr = new Date().toISOString().split('T')[0];
    const localImage = await downloadImage(dalleUrl, `${dateStr}_${story.id}.png`);
    const publicImageUrl = await uploadImageToCloudinary(localImage);

    enqueue({
      story: { id: story.id, dish: story.dish, category: story.category },
      instagram: { caption: igCaption, imageUrl: publicImageUrl },
      twitter: { thread: twThread, localImagePath: localImage },
      image: { prompt: imgPrompt, publicUrl: publicImageUrl, localPath: localImage },
    });

    console.log();
  }

  console.log(`Queue size: ${queueSize()} items ready.\n`);
}

async function postFromQueueCommand() {
  validateEnv(['instagram', 'twitter']);

  const item = dequeue();
  if (!item) {
    console.log('Queue is empty. Run: node src/index.js queue fill');
    return;
  }

  console.log(`Posting: ${item.story.dish}\n`);
  const results = {};

  try {
    const igResult = await postToInstagram({
      imageUrl: item.instagram.imageUrl,
      caption: item.instagram.caption,
    });
    results.instagram = { success: true, postId: igResult.postId };
    recordPost(item.story.id, 'instagram', igResult.postId);
    console.log(`  ✅ Instagram posted!`);
  } catch (err) {
    results.instagram = { success: false, error: err.message };
    console.error(`  ❌ Instagram: ${err.message}`);
  }

  try {
    const tweets = parseThread(item.twitter.thread);
    const twResult = item.twitter.localImagePath
      ? await postThreadWithImage({ tweets, imagePath: item.twitter.localImagePath })
      : await postThread(tweets);
    results.twitter = { success: true, tweetIds: twResult.tweetIds };
    recordPost(item.story.id, 'twitter', twResult.tweetIds[0]);
    console.log(`  ✅ Twitter posted!`);
  } catch (err) {
    results.twitter = { success: false, error: err.message };
    console.error(`  ❌ Twitter: ${err.message}`);
  }

  if (Object.values(results).some(r => r.success)) {
    markPosted(item, results);
  } else {
    markFailed(item, 'All platforms failed');
  }

  console.log();
}

function showQueueStatus() {
  const size = queueSize();
  console.log(`Queue: ${size} item(s) ready to post`);
  if (size === 0) {
    console.log('Run: node src/index.js queue fill 5  (pre-generate 5 posts)');
  }
  console.log();
}

// ─── Image prompt only ─────────────────────────────────────────────────────────

async function showImagePrompt(storyId) {
  validateEnv([]);
  const story = storyId ? pickStoryById(storyId) : pickNextStory();
  console.log(`Story: ${story.dish} (${story.id})\n`);

  const prompt = await generateImagePrompt(story);
  console.log('Image Generation Prompt:\n');
  console.log(prompt);
  console.log();
}

main().catch(err => {
  console.error('Fatal error:', err.message);
  process.exit(1);
});
