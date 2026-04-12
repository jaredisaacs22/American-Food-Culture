#!/usr/bin/env node

/**
 * American Food Culture — Social Media Content Pipeline
 *
 * Usage:
 *   node src/index.js generate [story-id]      Generate content (preview only)
 *   node src/index.js preview [story-id]        Same as generate
 *   node src/index.js post instagram [story-id] Generate & post to Instagram
 *   node src/index.js post twitter [story-id]   Generate & post to Twitter/X
 *   node src/index.js post all [story-id]       Generate & post to all platforms
 *   node src/index.js stories                   List all available stories
 *   node src/index.js image-prompt [story-id]   Generate retro image prompt
 */

require('dotenv').config();

const { validateEnv } = require('./config/env');
const brand = require('./config/brand');
const { loadStories, pickNextStory, pickStoryById, recordPost } = require('./utils/story-picker');
const { generateInstagramPost, generateTwitterPost } = require('./generators/story-generator');
const { generateImagePrompt, generateGraphicSpec } = require('./generators/image-prompt-generator');
const { postToInstagram } = require('./platforms/instagram');
const { postThread, parseThread } = require('./platforms/twitter');

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

    case 'image-prompt':
      return showImagePrompt(args[0]);

    default:
      printUsage();
  }
}

function printUsage() {
  console.log(`Usage:
  node src/index.js stories                   List all food stories
  node src/index.js generate [story-id]       Preview generated content
  node src/index.js post instagram [story-id] Post to Instagram
  node src/index.js post twitter [story-id]   Post to Twitter/X
  node src/index.js post all [story-id]       Post to all platforms
  node src/index.js image-prompt [story-id]   Generate image prompt

If no story-id is given, a story is picked automatically.
`);
}

function listStories() {
  const stories = loadStories();
  console.log(`Available stories (${stories.length}):\n`);
  for (const s of stories) {
    const tag = s.category === 'americanized' ? '[AMERICANIZED]' : '[ORIGIN]      ';
    console.log(`  ${tag}  ${s.id.padEnd(25)} ${s.dish}`);
  }
  console.log(`\nUse any ID above with: node src/index.js generate <story-id>\n`);
}

async function previewContent(storyId) {
  validateEnv([]);

  const story = storyId ? pickStoryById(storyId) : pickNextStory();
  console.log(`Story: ${story.dish} (${story.id})\n`);
  console.log(`${'─'.repeat(50)}`);

  console.log('\n📸 INSTAGRAM CAPTION:\n');
  const igPost = await generateInstagramPost(story);
  console.log(igPost);

  console.log(`\n${'─'.repeat(50)}`);
  console.log('\n🐦 TWITTER THREAD:\n');
  const twPost = await generateTwitterPost(story);
  console.log(twPost);

  console.log(`\n${'─'.repeat(50)}`);
  console.log('\n🎨 IMAGE PROMPT:\n');
  const imgPrompt = await generateImagePrompt(story);
  console.log(imgPrompt);

  console.log(`\n${'─'.repeat(50)}`);
  console.log('\n🖼️  GRAPHIC SPEC:\n');
  const spec = generateGraphicSpec(story);
  console.log(JSON.stringify(spec, null, 2));

  console.log(`\n${'═'.repeat(50)}`);
  console.log('Preview complete. Use "post" command to publish.\n');
}

async function postContent(platform, storyId) {
  const platforms = platform === 'all' ? ['instagram', 'twitter'] : [platform];

  if (!platforms.every(p => ['instagram', 'twitter'].includes(p))) {
    console.error(`Unknown platform: ${platform}`);
    console.error('Use: instagram, twitter, or all');
    process.exit(1);
  }

  validateEnv(platforms);

  const story = storyId ? pickStoryById(storyId) : pickNextStory();
  console.log(`Story: ${story.dish} (${story.id})\n`);

  for (const p of platforms) {
    console.log(`\nPosting to ${p.toUpperCase()}...`);
    try {
      if (p === 'instagram') {
        const caption = await generateInstagramPost(story);
        console.log('\nGenerated caption:');
        console.log(caption.substring(0, 200) + '...\n');

        // NOTE: You need to provide a public image URL.
        // Generate an image using the image-prompt command first,
        // create it with your preferred tool, and upload it.
        console.log('  ⚠️  Instagram requires a public image URL.');
        console.log('  Run: node src/index.js image-prompt ' + story.id);
        console.log('  Create the image, upload to Cloudinary, then set imageUrl below.\n');
        console.log('  To post with an image, use the programmatic API:');
        console.log('  const { postToInstagram } = require("./src/platforms/instagram");');
        console.log('  postToInstagram({ imageUrl: "https://...", caption });\n');

        // Uncomment when you have an image URL:
        // const result = await postToInstagram({ imageUrl: YOUR_IMAGE_URL, caption });
        // recordPost(story.id, 'instagram', result.postId);
      }

      if (p === 'twitter') {
        const threadText = await generateTwitterPost(story);
        const tweets = parseThread(threadText);
        console.log(`\nGenerated thread (${tweets.length} tweets):`);
        tweets.forEach((t, i) => console.log(`  ${i + 1}/ ${t.substring(0, 80)}...`));
        console.log();

        const result = await postThread(tweets);
        recordPost(story.id, 'twitter', result.tweetIds[0]);
        console.log(`  ✅ Thread posted to Twitter!`);
      }
    } catch (err) {
      console.error(`  ❌ Failed to post to ${p}: ${err.message}`);
      if (err.response?.data) {
        console.error('  API response:', JSON.stringify(err.response.data, null, 2));
      }
    }
  }

  console.log('\nDone!\n');
}

async function showImagePrompt(storyId) {
  validateEnv([]);

  const story = storyId ? pickStoryById(storyId) : pickNextStory();
  console.log(`Story: ${story.dish} (${story.id})\n`);

  const prompt = await generateImagePrompt(story);
  console.log('Image Generation Prompt:\n');
  console.log(prompt);

  console.log('\n\nGraphic Spec:\n');
  console.log(JSON.stringify(generateGraphicSpec(story), null, 2));
  console.log();
}

main().catch(err => {
  console.error('Fatal error:', err.message);
  process.exit(1);
});
