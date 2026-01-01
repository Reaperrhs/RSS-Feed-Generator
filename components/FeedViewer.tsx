import React, { useState } from 'react';
import { SavedFeed } from '../types';
import { Button } from './Button';
import { ArrowLeft, ExternalLink, Calendar, Code, List, Copy, Check, Download, Info, Cloud, Link as LinkIcon, Zap, Clock } from 'lucide-react';

interface FeedViewerProps {
  feed: SavedFeed;
  onBack: () => void;
}

export const FeedViewer: React.FC<FeedViewerProps> = ({ feed, onBack }) => {
  const [viewMode, setViewMode] = useState<'list' | 'code'>('list');
  const [copied, setCopied] = useState(false);
  const [urlCopied, setUrlCopied] = useState(false);

  // Infer type for legacy feeds
  const feedType = feed.type || (feed.fileId ? 'static' : (feed.publicUrl && feed.publicUrl.includes('?url=') ? 'dynamic' : 'static'));

  const handleCopyXML = () => {
    navigator.clipboard.writeText(feed.xmlContent);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleCopyPublicUrl = () => {
    if (feed.publicUrl) {
      navigator.clipboard.writeText(feed.publicUrl);
      setUrlCopied(true);
      setTimeout(() => setUrlCopied(false), 2000);
    }
  };

  const handleDownload = () => {
    const blob = new Blob([feed.xmlContent], { type: 'application/xml' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${feed.parsedChannel.title.replace(/[^a-z0-9]/gi, '_').toLowerCase()}_feed.xml`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <Button variant="ghost" onClick={onBack} className="pl-0 hover:bg-transparent hover:text-primary">
          <ArrowLeft className="w-5 h-5 mr-1" /> Back to Dashboard
        </Button>
        <div className="flex gap-2">
          <Button
            variant={viewMode === 'list' ? 'primary' : 'secondary'}
            onClick={() => setViewMode('list')}
            className="text-sm"
          >
            <List className="w-4 h-4 mr-2" /> Items
          </Button>
          <Button
            variant={viewMode === 'code' ? 'primary' : 'secondary'}
            onClick={() => setViewMode('code')}
            className="text-sm"
          >
            <Code className="w-4 h-4 mr-2" /> XML Source
          </Button>
        </div>
      </div>

      <div className="bg-card border border-slate-700 rounded-xl p-8 shadow-sm">
        <div className="mb-8 border-b border-slate-700 pb-6">
          <div className="flex justify-between items-start">
            <div>
              <div className="flex items-center gap-3 mb-2">
                <h1 className="text-3xl font-bold text-white">{feed.parsedChannel.title}</h1>
                {feedType === 'dynamic' ? (
                  <span className="bg-green-500/10 text-green-400 border border-green-500/20 text-xs font-bold px-2 py-0.5 rounded-full flex items-center gap-1">
                    <Zap className="w-3 h-3" /> LIVE
                  </span>
                ) : (
                  <span className="bg-amber-500/10 text-amber-400 border border-amber-500/20 text-xs font-bold px-2 py-0.5 rounded-full flex items-center gap-1">
                    <Clock className="w-3 h-3" /> SNAPSHOT
                  </span>
                )}
              </div>
              <p className="text-slate-400 mb-4">{feed.parsedChannel.description}</p>
              <div className="flex items-center gap-4 text-sm text-slate-500">
                <a
                  href={feed.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center hover:text-primary transition-colors"
                >
                  <ExternalLink className="w-4 h-4 mr-1" />
                  {feed.url}
                </a>
                {feed.parsedChannel.lastBuildDate && (
                  <span className="flex items-center">
                    <Calendar className="w-4 h-4 mr-1" />
                    Updated: {feed.parsedChannel.lastBuildDate}
                  </span>
                )}
              </div>
            </div>
            <Button onClick={handleDownload} variant="secondary" className="shrink-0">
              <Download className="w-4 h-4 mr-2" />
              Download XML
            </Button>
          </div>

          {/* Integration Help Section */}
          <div className="mt-6 bg-slate-900/50 border border-slate-700 rounded-lg p-5">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-semibold text-white flex items-center">
                <Cloud className="w-4 h-4 text-secondary mr-2" />
                Integration
              </h3>
              {feed.publicUrl && (
                <span className={`text-xs px-2 py-0.5 rounded-full border ${feedType === 'dynamic'
                    ? 'bg-green-500/20 text-green-400 border-green-500/20'
                    : 'bg-amber-500/20 text-amber-400 border-amber-500/20'
                  }`}>
                  {feedType === 'dynamic' ? 'Auto-Updating' : 'Static File'}
                </span>
              )}
            </div>

            {feed.publicUrl ? (
              <div className="space-y-3">
                {feedType === 'static' && (
                  <div className="text-xs bg-amber-900/20 text-amber-200 border border-amber-500/20 p-2 rounded mb-2">
                    <strong>Note:</strong> This URL points to a static file. New posts will NOT appear automatically. For a live feed, please configure a Function Domain in settings.
                  </div>
                )}
                <p className="text-sm text-slate-400">
                  This feed is hosted on your Appwrite instance. Use this URL in n8n's <strong>RSS Read</strong> node.
                </p>
                <div className="flex gap-2">
                  <input
                    type="text"
                    readOnly
                    value={feed.publicUrl}
                    className="flex-1 bg-slate-950 border border-slate-700 rounded px-3 text-sm text-slate-300 font-mono"
                  />
                  <Button onClick={handleCopyPublicUrl} className="shrink-0">
                    {urlCopied ? <Check className="w-4 h-4" /> : <LinkIcon className="w-4 h-4" />}
                  </Button>
                </div>
              </div>
            ) : (
              <div className="flex items-start gap-3">
                <Info className="w-5 h-5 text-yellow-500 shrink-0 mt-0.5" />
                <div className="flex-1">
                  <h3 className="text-yellow-400 font-medium mb-1 text-sm">Local Feed Only</h3>
                  <p className="text-slate-400 text-sm mb-2">
                    This feed is only saved in your browser. To get a permanent public URL for n8n, configure the Appwrite integration in Settings.
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>

        {viewMode === 'list' ? (
          <div className="space-y-6">
            {feed.parsedChannel.items.map((item, idx) => (
              <article key={idx} className="group relative bg-slate-900/50 rounded-lg p-6 hover:bg-slate-900 transition-colors border border-slate-800 hover:border-slate-700">
                <div className="flex flex-col md:flex-row gap-6">
                  {/* Image Section */}
                  {item.imageUrl && (
                    <div className="shrink-0 md:w-48">
                      <div className="aspect-video md:aspect-[4/3] rounded-md overflow-hidden bg-slate-800 border border-slate-700">
                        <img
                          src={item.imageUrl}
                          alt=""
                          className="w-full h-full object-cover transition-transform group-hover:scale-105"
                          onError={(e) => {
                            (e.target as HTMLImageElement).style.display = 'none';
                            (e.target as HTMLImageElement).parentElement!.classList.add('hidden');
                          }}
                        />
                      </div>
                    </div>
                  )}

                  {/* Content Section */}
                  <div className="flex-1 min-w-0">
                    <div className="flex justify-between items-start gap-4">
                      <h3 className="text-xl font-semibold text-slate-100 mb-2 group-hover:text-primary transition-colors line-clamp-2">
                        <a href={item.link} target="_blank" rel="noopener noreferrer">
                          {item.title}
                        </a>
                      </h3>
                      <a
                        href={item.link}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="p-2 rounded-full bg-slate-800 text-slate-400 group-hover:bg-primary group-hover:text-white transition-all shrink-0"
                      >
                        <ExternalLink className="w-5 h-5" />
                      </a>
                    </div>

                    <div className="text-sm text-slate-500 mb-3 flex items-center gap-2">
                      <Calendar className="w-3 h-3" />
                      {item.pubDate}
                    </div>

                    <p className="text-slate-300 leading-relaxed text-sm line-clamp-3">
                      {item.description}
                    </p>
                  </div>
                </div>
              </article>
            ))}
          </div>
        ) : (
          <div className="relative">
            <div className="absolute top-4 right-4 flex gap-2">
              <Button variant="secondary" onClick={handleCopyXML} className="text-xs py-1 px-3 h-8">
                {copied ? <Check className="w-3 h-3 mr-1" /> : <Copy className="w-3 h-3 mr-1" />}
                {copied ? 'Copied' : 'Copy'}
              </Button>
            </div>
            <pre className="bg-slate-950 p-6 rounded-lg overflow-x-auto text-sm font-mono text-green-400 border border-slate-800 shadow-inner">
              {feed.xmlContent}
            </pre>
          </div>
        )}
      </div>
    </div>
  );
};