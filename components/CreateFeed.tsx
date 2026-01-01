import React, { useState } from 'react';
import { generateRSSFromURL } from '../services/geminiService';
import { saveFeed, parseXMLToFeed, getAppwriteConfig } from '../services/storageService';
import { uploadXMLToAppwrite } from '../services/appwriteService';
import { Button } from './Button';
import { Rss, Search, AlertCircle, CheckCircle, CloudUpload } from 'lucide-react';
import { SavedFeed } from '../types';

interface CreateFeedProps {
  onSuccess: (feed: SavedFeed) => void;
  onCancel: () => void;
}

export const CreateFeed: React.FC<CreateFeedProps> = ({ onSuccess, onCancel }) => {
  const [url, setUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [step, setStep] = useState<'input' | 'processing' | 'preview' | 'uploading'>('input');
  const [generatedXML, setGeneratedXML] = useState('');
  const [previewData, setPreviewData] = useState<any>(null);

  const handleGenerate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!url) return;

    // Basic URL validation
    try {
      new URL(url);
    } catch (_) {
      setError("Please enter a valid URL (e.g., https://example.com)");
      return;
    }

    setLoading(true);
    setError(null);
    setStep('processing');

    try {
      const xml = await generateRSSFromURL(url);
      const parsed = parseXMLToFeed(xml);
      setGeneratedXML(xml);
      setPreviewData(parsed);
      setStep('preview');
    } catch (err: any) {
      setError(err.message || "Something went wrong while generating the feed.");
      setStep('input');
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (!previewData || !generatedXML) return;

    let publicUrl: string | undefined;
    let fileId: string | undefined;

    // Check if Appwrite is configured
    const appwriteConfig = getAppwriteConfig();

    if (appwriteConfig) {
      setStep('uploading');

      if (appwriteConfig.functionDomain) {
        // Dynamic Feed: specific function domain
        try {
          const domain = appwriteConfig.functionDomain.replace(/^https?:\/\//, '').replace(/\/$/, '');
          publicUrl = `https://${domain}/?url=${encodeURIComponent(url)}`;
          // specific function domain handles GET requests automatically
          await new Promise(resolve => setTimeout(resolve, 1000)); // UX delay
        } catch (e) {
          console.error("Error constructing dynamic URL", e);
        }
      } else {
        // Static Feed: Upload XML file
        try {
          const fileName = `${previewData.title.replace(/[^a-z0-9]/gi, '_').toLowerCase()}_${Date.now()}.xml`;
          const result = await uploadXMLToAppwrite(generatedXML, fileName, appwriteConfig);
          publicUrl = result.viewUrl;
          fileId = result.fileId;
        } catch (e: any) {
          console.error(e);
          setError("Feed generated, but upload to Appwrite failed. Saving locally only.");
        }
      }
    }

    const newFeed: SavedFeed = {
      id: crypto.randomUUID(),
      url,
      createdAt: Date.now(),
      xmlContent: generatedXML,
      parsedChannel: previewData,
      publicUrl,
      fileId,
      type: appwriteConfig?.functionDomain ? 'dynamic' : 'static'
    };

    saveFeed(newFeed);
    onSuccess(newFeed);
  };

  return (
    <div className="max-w-3xl mx-auto w-full">
      <div className="bg-card border border-slate-700 rounded-xl p-6 shadow-xl">
        <div className="mb-6">
          <h2 className="text-2xl font-bold text-white flex items-center gap-2">
            <Rss className="text-primary" />
            Generate New RSS Feed
          </h2>
          <p className="text-slate-400 mt-2">
            Enter the URL of any website. We will create a valid RSS feed for you.
          </p>
        </div>

        {step === 'input' && (
          <form onSubmit={handleGenerate} className="space-y-6">
            <div>
              <label htmlFor="url" className="block text-sm font-medium text-slate-300 mb-2">
                Website URL
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <Search className="h-5 w-5 text-slate-500" />
                </div>
                <input
                  type="url"
                  id="url"
                  className="block w-full pl-10 pr-3 py-3 bg-slate-900 border border-slate-700 rounded-lg focus:ring-primary focus:border-primary text-slate-100 placeholder-slate-500 sm:text-sm"
                  placeholder="https://techcrunch.com"
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  required
                />
              </div>
              {error && (
                <div className="mt-2 flex items-center text-red-400 text-sm">
                  <AlertCircle className="w-4 h-4 mr-1" />
                  {error}
                </div>
              )}
            </div>

            <div className="flex justify-end gap-3">
              <Button type="button" variant="secondary" onClick={onCancel}>
                Cancel
              </Button>
              <Button type="submit" isLoading={loading}>
                Generate Feed
              </Button>
            </div>
          </form>
        )}

        {(step === 'processing' || step === 'uploading') && (
          <div className="py-12 flex flex-col items-center justify-center text-center">
            <div className="w-16 h-16 border-4 border-primary border-t-transparent rounded-full animate-spin mb-6"></div>
            <h3 className="text-xl font-medium text-white mb-2">
              {step === 'uploading' ? 'Uploading to Appwrite...' : 'Analyzing Website...'}
            </h3>
            <p className="text-slate-400 max-w-md">
              {step === 'uploading'
                ? 'Saving your feed to the cloud to generate a public link for n8n.'
                : 'We are scanning the URL for content. This may take a few seconds.'}
            </p>
          </div>
        )}

        {step === 'preview' && previewData && (
          <div className="space-y-6">
            <div className="bg-green-500/10 border border-green-500/20 rounded-lg p-4 flex items-start gap-3">
              <CheckCircle className="w-5 h-5 text-green-500 shrink-0 mt-0.5" />
              <div>
                <h4 className="font-medium text-green-500">Feed Generated Successfully</h4>
                <p className="text-sm text-green-400/80">
                  Found {previewData.items.length} items from <strong>{previewData.title}</strong>.
                </p>
              </div>
            </div>

            <div className="bg-slate-900 rounded-lg p-4 border border-slate-700 max-h-60 overflow-y-auto">
              <h4 className="text-xs uppercase tracking-wider text-slate-500 font-bold mb-3">Feed Preview</h4>
              <ul className="space-y-3">
                {previewData.items.slice(0, 3).map((item: any, idx: number) => (
                  <li key={idx} className="border-b border-slate-800 last:border-0 pb-3 last:pb-0">
                    <div className="font-medium text-primary truncate">{item.title}</div>
                    <div className="text-xs text-slate-500 mt-1">{item.pubDate}</div>
                  </li>
                ))}
              </ul>
              {previewData.items.length > 3 && (
                <div className="text-center pt-2 text-xs text-slate-500 italic">
                  + {previewData.items.length - 3} more items...
                </div>
              )}
            </div>

            {error && (
              <div className="flex items-center text-red-400 text-sm bg-red-900/10 p-3 rounded">
                <AlertCircle className="w-4 h-4 mr-2" />
                {error}
              </div>
            )}

            {!getAppwriteConfig()?.functionDomain && (
              <div className="bg-amber-950/30 border border-amber-500/30 rounded-lg p-4 flex items-start gap-4 shadow-lg shadow-amber-900/10">
                <div className="bg-amber-500/20 p-2 rounded-full shrink-0">
                  <AlertCircle className="w-5 h-5 text-amber-500" />
                </div>
                <div>
                  <h4 className="font-bold text-amber-500 mb-1 tracking-wide">Static Snapshot Only</h4>
                  <p className="text-sm text-amber-200/80 leading-relaxed mb-3">
                    Without a configured <strong>Function Domain</strong>, this feed will be a one-time snapshot. It will <strong>NOT</strong> update automatically when the website changes.
                  </p>
                  <Button
                    variant="secondary"
                    className="h-8 text-xs bg-amber-900/40 border-amber-500/30 hover:bg-amber-900/60 text-amber-200"
                    onClick={() => window.alert("Go to Settings > Appwrite Integration > Function Domain")}
                  >
                    Configure Live Feed
                  </Button>
                </div>
              </div>
            )}

            <div className="flex justify-end gap-3">
              <Button variant="secondary" onClick={() => setStep('input')}>
                Back
              </Button>
              <Button onClick={handleSave} icon={getAppwriteConfig() ? <CloudUpload className="w-4 h-4" /> : undefined}>
                {getAppwriteConfig() ? 'Save & Upload to Cloud' : 'Save Locally'}
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};