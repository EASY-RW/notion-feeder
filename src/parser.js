import { markdownToBlocks } from '@tryfabric/martian';
import TurndownService from 'turndown';

function htmlToMarkdownJSON(htmlContent) {
  try {
    const turndownService = new TurndownService();
    return turndownService.turndown(htmlContent || '');
  } catch (error) {
    console.error('Failed to convert HTML to Markdown.', error);
    return '';
  }
}

function jsonToNotionBlocks(markdownContent) {
  return markdownToBlocks(markdownContent || '');
}

export default function htmlToNotionBlocks(htmlContent) {
  const markdownJson = htmlToMarkdownJSON(htmlContent);
  return jsonToNotionBlocks(markdownJson);
}
