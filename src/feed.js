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

function normalizeTitle(title = '') {
  const withoutTags = String(title).replace(/<[^>]*>/g, '');
  const decodedOnce = decodeHTML(withoutTags);
  const decodedTwice = decodeHTML(decodedOnce);
  return decodedTwice.replace(/\s+/g, ' ').trim();
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
      title: normalizeTitle(item.title),
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
    const link = item.link ? item.link.trim() : '';
    const guid = item.guid ? String(item.guid).trim() : '';
    const titleKey = item.title ? item.title.trim() : '';
    const publishedKey = item.pubDate
      ? new Date(item.pubDate).toISOString()
      : '';
    const dedupKey = link || guid || `${titleKey}__${publishedKey}`;

    if (!dedupKey) {
      return true;
    }

    if (seenLinks.has(dedupKey)) {
      return false;
    }

    seenLinks.add(dedupKey);
    return true;
  });

  // sort feed items by published date
  allNewFeedItems.sort((a, b) => new Date(a.pubDate) - new Date(b.pubDate));

  return allNewFeedItems;
}
