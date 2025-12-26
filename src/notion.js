import dotenv from 'dotenv';
import { Client, LogLevel } from '@notionhq/client';

dotenv.config();

const REQUIRED_ENV_VARS = [
  'NOTION_API_TOKEN',
  'NOTION_READER_DATABASE_ID',
  'NOTION_FEEDS_DATABASE_ID',
];

const {
  NOTION_API_TOKEN,
  NOTION_READER_DATABASE_ID,
  NOTION_FEEDS_DATABASE_ID,
  CI,
} = process.env;

const logLevel = CI ? LogLevel.INFO : LogLevel.DEBUG;

function validateEnv() {
  const missing = REQUIRED_ENV_VARS.filter((key) => !process.env[key]);
  if (missing.length) {
    const missingVars = missing.join(', ');
    throw new Error(
      `Missing required environment variables: ${missingVars}. Please set them before running the script.`
    );
  }
}

function createNotionClient() {
  validateEnv();
  return new Client({
    auth: NOTION_API_TOKEN,
    logLevel,
  });
}

async function queryDatabaseWithPagination(notion, databaseId, filter) {
  const results = [];
  let cursor;

  do {
    const response = await notion.databases.query({
      database_id: databaseId,
      filter,
      start_cursor: cursor,
    });
    results.push(...response.results);
    cursor = response.has_more ? response.next_cursor : undefined;
  } while (cursor);

  return results;
}

export async function getFeedUrlsFromNotion() {
  const notion = createNotionClient();

  try {
    const feedPages = await queryDatabaseWithPagination(
      notion,
      NOTION_FEEDS_DATABASE_ID,
      {
        or: [
          {
            property: 'Enabled',
            checkbox: {
              equals: true,
            },
          },
        ],
      }
    );

    const feeds = feedPages
      .map((item) => {
        const titleProperty = item.properties?.Title?.title || [];
        const link = item.properties?.Link?.url;
        if (!link || !titleProperty.length) {
          console.warn(`Skipping feed with missing data (ID: ${item.id}).`);
          return null;
        }
        return {
          title: titleProperty[0].plain_text,
          feedUrl: link,
        };
      })
      .filter(Boolean);

    return feeds;
  } catch (err) {
    console.error('Failed to fetch feeds from Notion.', err);
    return [];
  }
}

export async function addFeedItemToNotion(notionItem) {
  const { title, link, content } = notionItem;

  const notion = createNotionClient();

  try {
    await notion.pages.create({
      parent: {
        database_id: NOTION_READER_DATABASE_ID,
      },
      properties: {
        Title: {
          title: [
            {
              text: {
                content: title,
              },
            },
          ],
        },
        Link: {
          url: link,
        },
      },
      children: content,
    });
  } catch (err) {
    console.error(`Failed to add feed item "${title}" to Notion.`, err);
  }
}

export async function deleteOldUnreadFeedItemsFromNotion() {
  const notion = createNotionClient();

  // Create a datetime which is 30 days earlier than the current time
  const fetchBeforeDate = new Date();
  fetchBeforeDate.setDate(fetchBeforeDate.getDate() - 30);

  try {
    const oldUnreadPages = await queryDatabaseWithPagination(
      notion,
      NOTION_READER_DATABASE_ID,
      {
        and: [
          {
            property: 'Created At',
            date: {
              on_or_before: fetchBeforeDate.toJSON(),
            },
          },
          {
            property: 'Read',
            checkbox: {
              equals: false,
            },
          },
        ],
      }
    );

    for (let i = 0; i < oldUnreadPages.length; i++) {
      const page = oldUnreadPages[i];
      try {
        await notion.pages.update({
          page_id: page.id,
          archived: true,
        });
      } catch (err) {
        console.error(`Failed to archive page ${page.id}.`, err);
      }
    }
  } catch (err) {
    console.error('Failed to archive old unread feed items.', err);
  }
}
