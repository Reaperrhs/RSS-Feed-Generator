import React, { useState, useEffect } from 'react';
import { Dashboard } from './components/Dashboard';
import { CreateFeed } from './components/CreateFeed';
import { FeedViewer } from './components/FeedViewer';
import { SettingsModal } from './components/SettingsModal';
import { AppView, SavedFeed } from './types';
import { getSavedFeeds } from './services/storageService';
import { Rss, Settings } from 'lucide-react';
import { Button } from './components/Button';

const App: React.FC = () => {
  const [view, setView] = useState<AppView>(AppView.DASHBOARD);
  const [feeds, setFeeds] = useState<SavedFeed[]>([]);
  const [selectedFeed, setSelectedFeed] = useState<SavedFeed | null>(null);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);

  useEffect(() => {
    refreshFeeds();
  }, []);

  const refreshFeeds = () => {
    setFeeds(getSavedFeeds());
  };

  const handleCreateSuccess = (feed: SavedFeed) => {
    refreshFeeds();
    setSelectedFeed(feed);
    setView(AppView.VIEW_FEED);
  };

  const handleSelectFeed = (feed: SavedFeed) => {
    setSelectedFeed(feed);
    setView(AppView.VIEW_FEED);
  };

  return (
    <div className="min-h-screen bg-dark text-slate-100 flex flex-col font-sans">
      {/* Header */}
      <header className="border-b border-slate-800 bg-dark/50 backdrop-blur-md sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div
            className="flex items-center gap-2 cursor-pointer hover:opacity-80 transition-opacity"
            onClick={() => {
              setView(AppView.DASHBOARD);
              setSelectedFeed(null);
            }}
          >
            <div className="bg-gradient-to-br from-primary to-red-600 text-white p-1.5 rounded-lg shadow-lg">
              <Rss className="w-5 h-5" />
            </div>
            <span className="font-bold text-xl tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-white to-slate-400">
              RSS Gen AI
            </span>
          </div>

          <div className="flex items-center gap-4">

            <Button
              variant="ghost"
              onClick={() => setIsSettingsOpen(true)}
              className="p-2 h-auto"
              title="Appwrite Settings"
            >
              <Settings className="w-5 h-5" />
            </Button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 w-full">
        {view === AppView.DASHBOARD && (
          <Dashboard
            feeds={feeds}
            onCreateNew={() => setView(AppView.CREATE)}
            onSelectFeed={handleSelectFeed}
            onRefresh={refreshFeeds}
          />
        )}

        {view === AppView.CREATE && (
          <CreateFeed
            onSuccess={handleCreateSuccess}
            onCancel={() => setView(AppView.DASHBOARD)}
          />
        )}

        {view === AppView.VIEW_FEED && selectedFeed && (
          <FeedViewer
            feed={selectedFeed}
            onBack={() => {
              setView(AppView.DASHBOARD);
              setSelectedFeed(null);
            }}
          />
        )}
      </main>

      <SettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
      />

      {/* Footer */}
      <footer className="border-t border-slate-800 py-8 mt-auto bg-dark">
        <div className="max-w-7xl mx-auto px-4 text-center text-slate-500 text-sm">
          &copy; {new Date().getFullYear()} RSS Gen AI. All rights reserved.
        </div>
      </footer>
    </div>
  );
};

export default App;