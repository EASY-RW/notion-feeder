import getNewFeedItems from './feed';
import {
  addFeedItemToNotion,
  deleteOldUnreadFeedItemsFromNotion,
} from './notion';
import htmlToNotionBlocks from './parser';

function extractPublishedAt(item) {
  const candidates = [
    item.isoDate,
    item.published,
    item.pubDate,
    item.updated,
  ].filter(Boolean);

  for (let i = 0; i < candidates.length; i++) {
    const candidate = candidates[i];
    const date = new Date(candidate);
    if (!Number.isNaN(date.getTime())) {
      return date.toISOString();
    }
  }

  return null;
}

async function index() {
  const feedItems = await getNewFeedItems();

  if (!feedItems.length) {
    console.info('No new feed items to add to Notion.');
    return;
  }

  for (let i = 0; i < feedItems.length; i++) {
    const item = feedItems[i];
    const notionItem = {
      title: item.title,
      link: item.link,
      content: htmlToNotionBlocks(item.content || item.contentSnippet),
    };
    await addFeedItemToNotion(notionItem);
  }

  await deleteOldUnreadFeedItemsFromNotion();
}

index().catch((error) => {
  console.error('Failed to process feeds.', error);
  process.exitCode = 1;
});
