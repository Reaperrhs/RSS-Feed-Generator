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
  const itemNodes = xmlDoc.querySelectorAll("item");
  
  itemNodes.forEach(node => {
    const enclosure = node.querySelector("enclosure");
    let imageUrl = undefined;
    
    // Check for enclosure (standard RSS image)
    if (enclosure) {
      const type = enclosure.getAttribute("type");
      // Basic check if it's an image type or if explicitly no type but looks like an image
      if ((type && type.startsWith("image")) || !type) {
        imageUrl = enclosure.getAttribute("url") || undefined;
      }
    }

    // Fallback: Check for Media RSS <media:content> or <media:thumbnail> if model uses that namespace
    if (!imageUrl) {
        const mediaContent = node.getElementsByTagNameNS("http://search.yahoo.com/mrss/", "content")[0];
        if (mediaContent) imageUrl = mediaContent.getAttribute("url") || undefined;
    }
    if (!imageUrl) {
        const mediaThumbnail = node.getElementsByTagNameNS("http://search.yahoo.com/mrss/", "thumbnail")[0];
        if (mediaThumbnail) imageUrl = mediaThumbnail.getAttribute("url") || undefined;
    }

    items.push({
      title: node.querySelector("title")?.textContent || "No Title",
      link: node.querySelector("link")?.textContent || "#",
      description: node.querySelector("description")?.textContent || "",
      pubDate: node.querySelector("pubDate")?.textContent,
      guid: node.querySelector("guid")?.textContent,
      imageUrl: imageUrl
    });
  });

  return {
    title,
    link,
    description,
    lastBuildDate,
    items
  };
};