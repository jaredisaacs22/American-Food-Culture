const fs = require('fs');
const path = require('path');

const STORIES_PATH = path.join(__dirname, '..', 'stories', 'food-stories.json');
const HISTORY_PATH = path.join(__dirname, '..', 'stories', '.post-history.json');

/**
 * Load all food stories
 */
function loadStories() {
  return JSON.parse(fs.readFileSync(STORIES_PATH, 'utf-8'));
}

/**
 * Load post history (which stories have been posted and when)
 */
function loadHistory() {
  if (!fs.existsSync(HISTORY_PATH)) return {};
  return JSON.parse(fs.readFileSync(HISTORY_PATH, 'utf-8'));
}

/**
 * Save post history
 */
function saveHistory(history) {
  fs.writeFileSync(HISTORY_PATH, JSON.stringify(history, null, 2));
}

/**
 * Pick the next story to post.
 * Prioritizes stories that haven't been posted yet,
 * then falls back to least-recently-posted.
 */
function pickNextStory() {
  const stories = loadStories();
  const history = loadHistory();

  // Find stories never posted
  const unposted = stories.filter(s => !history[s.id]);
  if (unposted.length > 0) {
    // Pick a random unposted story
    return unposted[Math.floor(Math.random() * unposted.length)];
  }

  // All posted — pick the one posted longest ago
  stories.sort((a, b) => {
    const aTime = new Date(history[a.id]?.lastPosted || 0).getTime();
    const bTime = new Date(history[b.id]?.lastPosted || 0).getTime();
    return aTime - bTime;
  });

  return stories[0];
}

/**
 * Pick a specific story by ID
 */
function pickStoryById(id) {
  const stories = loadStories();
  const story = stories.find(s => s.id === id);
  if (!story) {
    const ids = stories.map(s => s.id).join(', ');
    throw new Error(`Story "${id}" not found. Available: ${ids}`);
  }
  return story;
}

/**
 * Record that a story was posted
 */
function recordPost(storyId, platform, postId) {
  const history = loadHistory();
  if (!history[storyId]) {
    history[storyId] = { posts: [], lastPosted: null };
  }
  history[storyId].posts.push({
    platform,
    postId,
    postedAt: new Date().toISOString(),
  });
  history[storyId].lastPosted = new Date().toISOString();
  saveHistory(history);
}

module.exports = { loadStories, pickNextStory, pickStoryById, recordPost };
