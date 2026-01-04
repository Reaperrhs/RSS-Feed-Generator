import React from 'react';
import { SavedFeed } from '../types';
import { Button } from './Button';
import { Plus, Trash2, ExternalLink, Rss, Copy, Check } from 'lucide-react';
import { deleteFeed } from '../services/storageService';

interface DashboardProps {
  feeds: SavedFeed[];
  onCreateNew: () => void;
  onSelectFeed: (feed: SavedFeed) => void;
  onRefresh: () => void;
}

export const Dashboard: React.FC<DashboardProps> = ({ feeds, onCreateNew, onSelectFeed, onRefresh }) => {
  const [copiedId, setCopiedId] = React.useState<string | null>(null);

  const handleDelete = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    if (window.confirm("Are you sure you want to delete this feed?")) {
      deleteFeed(id);
      onRefresh();
    }
  };

  const handleCopy = (e: React.MouseEvent, url: string | undefined, id: string) => {
    e.stopPropagation();
    if (!url) return;

    navigator.clipboard.writeText(url).then(() => {
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 2000);
    });
  };

  if (feeds.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 bg-card border border-slate-700 rounded-xl border-dashed">
        <div className="bg-slate-800 p-4 rounded-full mb-6">
          <Rss className="w-10 h-10 text-primary" />
        </div>
        <h2 className="text-2xl font-bold text-white mb-2">No Feeds Yet</h2>
        <p className="text-slate-400 max-w-sm text-center mb-8">
          You haven't generated any RSS feeds yet. Start by adding a website URL to create your first feed.
        </p>
        <Button onClick={onCreateNew} className="shadow-lg shadow-primary/20">
          <Plus className="w-5 h-5 mr-2" />
          Create First Feed
        </Button>
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-8">
        <div>
          <h2 className="text-2xl font-bold text-white">Your Feeds</h2>
          <p className="text-slate-400">Manage and view your generated RSS feeds</p>
        </div>
        <Button onClick={onCreateNew}>
          <Plus className="w-5 h-5 mr-2" />
          New Feed
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {feeds.map((feed) => (
          <div
            key={feed.id}
            onClick={() => onSelectFeed(feed)}
            className="group bg-card border border-slate-700 hover:border-primary/50 rounded-xl p-6 cursor-pointer transition-all duration-300 hover:shadow-xl hover:shadow-primary/5 hover:-translate-y-1 relative overflow-hidden"
          >
            <div className="absolute top-0 right-0 p-4 opacity-0 group-hover:opacity-100 transition-opacity">
              <button
                onClick={(e) => handleDelete(e, feed.id)}
                className="text-slate-500 hover:text-red-500 transition-colors p-2 rounded-full hover:bg-slate-800"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>

            <div className="flex items-start justify-between mb-4">
              <div className="p-3 bg-slate-800 rounded-lg group-hover:bg-primary/10 group-hover:text-primary transition-colors text-slate-400">
                <Rss className="w-6 h-6" />
              </div>
            </div>

            <h3 className="text-lg font-bold text-white mb-1 line-clamp-1">{feed.parsedChannel.title}</h3>

            <div className="flex items-center gap-2 mb-3">
              <a
                href={feed.url}
                target="_blank"
                rel="noopener noreferrer"
                onClick={(e) => e.stopPropagation()}
                className="text-xs text-primary hover:underline truncate flex-1"
              >
                {feed.url}
              </a>
              {feed.publicUrl && (
                <button
                  onClick={(e) => handleCopy(e, feed.publicUrl, feed.id)}
                  className={`flex-shrink-0 p-1.5 rounded-md transition-all duration-200 ${copiedId === feed.id
                      ? 'bg-green-500/20 text-green-500'
                      : 'bg-slate-800 text-slate-400 hover:text-primary hover:bg-slate-700'
                    }`}
                  title="Copy RSS URL"
                >
                  {copiedId === feed.id ? (
                    <Check className="w-3.5 h-3.5" />
                  ) : (
                    <Copy className="w-3.5 h-3.5" />
                  )}
                </button>
              )}
            </div>

            <p className="text-slate-400 text-sm mb-4 line-clamp-2 h-10">
              {feed.parsedChannel.description || 'No description available.'}
            </p>

            <div className="flex items-center justify-between pt-4 border-t border-slate-700/50">
              <span className="text-xs text-slate-500">
                {feed.parsedChannel.items.length} items
              </span>
              <div className="flex items-center text-xs font-medium text-primary opacity-0 group-hover:opacity-100 transition-opacity">
                View Feed <ExternalLink className="w-3 h-3 ml-1" />
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};