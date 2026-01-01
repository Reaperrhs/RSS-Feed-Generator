export interface FeedItem {
  title: string;
  link: string;
  description: string;
  pubDate?: string;
  guid?: string;
  imageUrl?: string;
}

export interface FeedChannel {
  title: string;
  link: string;
  description: string;
  lastBuildDate?: string;
  items: FeedItem[];
}

export interface SavedFeed {
  id: string;
  url: string;
  createdAt: number;
  xmlContent: string;
  parsedChannel: FeedChannel;
  publicUrl?: string; // URL from Appwrite
  fileId?: string; // Appwrite File ID
  type: 'static' | 'dynamic'; // Feed generation mode
}

export interface AppwriteConfig {
  endpoint: string;
  projectId: string;
  bucketId: string;
  functionId?: string;
  functionDomain?: string;
}

export enum AppView {
  DASHBOARD = 'DASHBOARD',
  CREATE = 'CREATE',
  VIEW_FEED = 'VIEW_FEED',
}