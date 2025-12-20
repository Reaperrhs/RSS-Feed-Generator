import { SavedFeed, AppwriteConfig } from '../types';

const STORAGE_KEY = 'rss_gen_feeds';
const CONFIG_KEY = 'rss_gen_appwrite_config';

// --- Appwrite Config ---
export const getAppwriteConfig = (): AppwriteConfig | null => {
  const raw = localStorage.getItem(CONFIG_KEY);
  return raw ? JSON.parse(raw) : null;
};

export const saveAppwriteConfig = (config: AppwriteConfig) => {
  localStorage.setItem(CONFIG_KEY, JSON.stringify(config));
};

export const clearAppwriteConfig = () => {
  localStorage.removeItem(CONFIG_KEY);
};

// --- Feeds ---
export const getSavedFeeds = (): SavedFeed[] => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    return JSON.parse(raw);
  } catch (e) {
    console.error("Failed to load feeds", e);
    return [];
  }
};

export const saveFeed = (feed: SavedFeed): void => {
  const feeds = getSavedFeeds();
  // Check if already exists by URL, update if so, or append
  const existingIndex = feeds.findIndex(f => f.url === feed.url);
  if (existingIndex >= 0) {
    feeds[existingIndex] = feed;
  } else {
    feeds.unshift(feed);
  }
  localStorage.setItem(STORAGE_KEY, JSON.stringify(feeds));
};

export const deleteFeed = (id: string): void => {
  const feeds = getSavedFeeds().filter(f => f.id !== id);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(feeds));
};

export const parseXMLToFeed = (xml: string): any => {
  const parser = new DOMParser();
  const xmlDoc = parser.parseFromString(xml, "text/xml");

  // Check for parsing errors explicitly
  const parserError = xmlDoc.querySelector("parsererror");
  if (parserError) {
    console.error("XML Parsing Error Content:", parserError.textContent);
    console.log("Raw XML causing error:", xml);
    throw new Error("Generated content is not valid XML. Please try again.");
  }

  const channel = xmlDoc.querySelector("channel");
  if (!channel) {
    console.log("Raw XML causing error:", xml);
    throw new Error("Invalid RSS: No channel element found in the response.");
  }

  const title = channel.querySelector("title")?.textContent || "Untitled Feed";
  const link = channel.querySelector("link")?.textContent || "";
  const description = channel.querySelector("description")?.textContent || "";
  const lastBuildDate = channel.querySelector("lastBuildDate")?.textContent;

  const items: any[] = [];
  const decodeEntities = (text: string) => {
    if (!text) return text;
    const textArea = document.createElement('textarea');
    textArea.innerHTML = text;
    return textArea.value;
  };

  const itemNodes = xmlDoc.querySelectorAll("item");
  itemNodes.forEach(node => {
    let imageUrl = undefined;

    // 1. Check for enclosure (standard RSS image)
    const enclosures = node.getElementsByTagName("enclosure");
    if (enclosures.length > 0) {
      const enc = enclosures[0];
      const url = enc.getAttribute("url");
      if (url) imageUrl = decodeEntities(url);
    }

    // 2. Fallback: Check for Media RSS (with and without namespaces)
    if (!imageUrl) {
      // Try to find media tags explicitly by name if getElementsByTagNameNS is finicky or namespaced differently
      const mediaTags = ['media:content', 'media:thumbnail', 'content', 'thumbnail'];
      for (const tagName of mediaTags) {
        const elements = node.getElementsByTagName(tagName);
        if (elements.length > 0) {
          const url = elements[0].getAttribute("url");
          if (url) {
            imageUrl = decodeEntities(url);
            break;
          }
        }
      }

      // Also try with namespace if above fails
      if (!imageUrl) {
        const mediaNamespace = "http://search.yahoo.com/mrss/";
        const contentByNS = node.getElementsByTagNameNS(mediaNamespace, "content");
        if (contentByNS.length > 0) {
          imageUrl = decodeEntities(contentByNS[0].getAttribute("url") || "");
        } else {
          const thumbByNS = node.getElementsByTagNameNS(mediaNamespace, "thumbnail");
          if (thumbByNS.length > 0) {
            imageUrl = decodeEntities(thumbByNS[0].getAttribute("url") || "");
          }
        }
      }
    }

    // 3. Fallback: Check for image in description or content:encoded
    if (!imageUrl) {
      const description = node.querySelector("description")?.textContent || "";
      const contentEncoded = node.getElementsByTagName("content:encoded")[0]?.textContent || "";
      const combinedContent = description + contentEncoded;

      const imgMatch = combinedContent.match(/<img[^>]+src=["']([^"']+)["']/i);
      if (imgMatch) {
        imageUrl = decodeEntities(imgMatch[1]);
      }
    }

    const item = {
      title: decodeEntities(node.querySelector("title")?.textContent || "No Title"),
      link: decodeEntities(node.querySelector("link")?.textContent || "#").trim(),
      description: decodeEntities(node.querySelector("description")?.textContent || ""),
      pubDate: decodeEntities(node.querySelector("pubDate")?.textContent || ""),
      guid: decodeEntities(node.querySelector("guid")?.textContent || ""),
      imageUrl: imageUrl
    };

    console.log("Extracted Feed Item (Decoded):", item);
    items.push(item);
  });

  return {
    title,
    link,
    description,
    lastBuildDate,
    items
  };
};