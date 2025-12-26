import Parser from 'rss-parser';
import dotenv from 'dotenv';
import { decodeHTML } from 'entities';
import timeDifference from './helpers';
import { getFeedUrlsFromNotion } from './notion';

dotenv.config();

const { RUN_FREQUENCY } = process.env;
const DEFAULT_RUN_FREQUENCY = 86400; // 24 hours

function getRunFrequencyInSeconds() {
  const parsed = Number(RUN_FREQUENCY);
  if (Number.isFinite(parsed) && parsed > 0) {
    return parsed;
  }

  console.warn(
    `Invalid or missing RUN_FREQUENCY (${RUN_FREQUENCY}). Falling back to ${DEFAULT_RUN_FREQUENCY} seconds.`
  );
  return DEFAULT_RUN_FREQUENCY;
}

async function getNewFeedItemsFrom(feedUrl, runFrequencySeconds) {
  const parser = new Parser();
  let rss;
  try {
    rss = await parser.parseURL(feedUrl);
  } catch (error) {
    console.error(`Failed to parse feed URL: ${feedUrl}`, error);
    return [];
  }
  const currentTime = new Date().getTime() / 1000;

  // Filter out items that fall in the run frequency range
  return rss.items
    .filter((item) => {
      if (!item.pubDate || !item.title || !item.link) {
        console.warn(`Skipping item with missing data from ${feedUrl}.`);
        return false;
      }
      const blogPublishedTime = new Date(item.pubDate).getTime() / 1000;
      const { diffInSeconds } = timeDifference(currentTime, blogPublishedTime);
      return diffInSeconds >= 0 && diffInSeconds < runFrequencySeconds;
    })
    .map((item) => ({
      ...item,
      title: decodeHTML(String(item.title || '')).trim(),
    }));
}

export default async function getNewFeedItems() {
  let allNewFeedItems = [];

  const feeds = await getFeedUrlsFromNotion();
  const runFrequencySeconds = getRunFrequencyInSeconds();

  for (let i = 0; i < feeds.length; i++) {
    const { feedUrl } = feeds[i];
    const feedItems = await getNewFeedItemsFrom(feedUrl, runFrequencySeconds);
    allNewFeedItems = [...allNewFeedItems, ...feedItems];
  }

  const seenLinks = new Set();
  allNewFeedItems = allNewFeedItems.filter((item) => {
    const link = item.link || item.guid;
    if (!link) {
      return true;
    }
    if (seenLinks.has(link)) {
      return false;
    }
    seenLinks.add(link);
    return true;
  });

  // sort feed items by published date
  allNewFeedItems.sort((a, b) => new Date(a.pubDate) - new Date(b.pubDate));

  return allNewFeedItems;
}
