import React, { useState, useEffect } from 'react';
import { Button } from './Button';
import { X, Database, Check, AlertCircle, Wifi, Globe } from 'lucide-react';
import { AppwriteConfig } from '../types';
import { getAppwriteConfig, saveAppwriteConfig, clearAppwriteConfig } from '../services/storageService';
import { validateConnection } from '../services/appwriteService';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({ isOpen, onClose }) => {
  const [config, setConfig] = useState<AppwriteConfig>({
    endpoint: '',
    projectId: '',
    bucketId: '',
    functionId: '',
    functionDomain: ''
  });
  const [status, setStatus] = useState<'idle' | 'testing' | 'success' | 'error'>('idle');
  const [errorMessage, setErrorMessage] = useState<string>('');
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saved'>('idle');
  const [currentHostname, setCurrentHostname] = useState<string>('');

  useEffect(() => {
    if (isOpen) {
      const saved = getAppwriteConfig();
      if (saved) setConfig(saved);
      setStatus('idle');
      setErrorMessage('');
      setSaveStatus('idle');
      setCurrentHostname(window.location.hostname);
    }
  }, [isOpen]);

  const validateInputs = (): boolean => {
    if (!config.endpoint || !config.projectId || !config.bucketId) {
      setStatus('error');
      setErrorMessage("Please fill in all fields.");
      return false;
    }

    if (config.projectId.toLowerCase().includes('localhost')) {
      setStatus('error');
      setErrorMessage("Invalid Project ID: You entered 'localhost'. Please copy the alphanumeric Project ID (e.g., 6946...) from your Appwrite Settings.");
      return false;
    }

    return true;
  };

  const handleTestConnection = async () => {
    if (!validateInputs()) return;

    setStatus('testing');
    setErrorMessage('');

    // Trim inputs before testing
    const cleanConfig = {
      endpoint: config.endpoint.trim(),
      projectId: config.projectId.trim(),
      bucketId: config.bucketId.trim(),
      functionId: config.functionId?.trim()
    };

    const result = await validateConnection(cleanConfig);

    if (result.isValid) {
      setStatus('success');
    } else {
      setStatus('error');
      // If network error, append the hostname hint
      if (result.error && result.error.includes("Network Error")) {
        setErrorMessage(`${result.error} (Your current hostname is '${currentHostname}')`);
      } else {
        setErrorMessage(result.error || "Connection failed.");
      }
    }
  };

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    if (!validateInputs()) return;

    // Save trimmed values
    const cleanConfig = {
      endpoint: config.endpoint.trim(),
      projectId: config.projectId.trim(),
      bucketId: config.bucketId.trim(),
      functionId: config.functionId?.trim(),
      functionDomain: config.functionDomain?.trim()
    };

    saveAppwriteConfig(cleanConfig);
    setSaveStatus('saved');
    setTimeout(() => {
      setSaveStatus('idle');
      onClose();
    }, 1000);
  };

  const handleClear = () => {
    clearAppwriteConfig();
    setConfig({ endpoint: '', projectId: '', bucketId: '', functionId: '', functionDomain: '' });
    setStatus('idle');
    setErrorMessage('');
    onClose();
  }

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div className="bg-card border border-slate-700 rounded-xl shadow-2xl w-full max-w-md overflow-hidden flex flex-col max-h-[90vh]">
        <div className="flex items-center justify-between p-4 border-b border-slate-700 bg-slate-900/50">
          <h2 className="text-xl font-bold text-white flex items-center gap-2">
            <Database className="text-secondary" />
            Appwrite Integration
          </h2>
          <button onClick={onClose} className="text-slate-400 hover:text-white transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="overflow-y-auto p-6 space-y-4">
          <div className="bg-blue-500/10 border border-blue-500/20 rounded-lg p-3 text-sm text-slate-300">
            <h4 className="font-semibold text-blue-400 mb-1">Configuration Required</h4>
            <p>Copy the <strong>Endpoint</strong> and <strong>Project ID</strong> from your Appwrite console.</p>
            <div className="mt-2 pt-2 border-t border-blue-500/20 flex items-center gap-2 text-xs">
              <Globe className="w-3 h-3 text-blue-400" />
              <span>
                You must add <strong>{currentHostname}</strong> to Appwrite Platforms.
              </span>
            </div>
          </div>

          <form id="settings-form" onSubmit={handleSave} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1">Appwrite Endpoint</label>
              <input
                type="text"
                placeholder="https://appwrite.yourdomain.com/v1"
                className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-white focus:ring-2 focus:ring-secondary focus:border-transparent"
                value={config.endpoint}
                onChange={e => {
                  setConfig({ ...config, endpoint: e.target.value });
                  setStatus('idle');
                  setErrorMessage('');
                }}
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1">Project ID</label>
              <input
                type="text"
                placeholder="e.g. 69460b6d..."
                className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-white focus:ring-2 focus:ring-secondary focus:border-transparent"
                value={config.projectId}
                onChange={e => {
                  setConfig({ ...config, projectId: e.target.value });
                  setStatus('idle');
                  setErrorMessage('');
                }}
                required
              />
              <p className="text-xs text-slate-500 mt-1">Found in Appwrite Console &gt; Settings.</p>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1">Storage Bucket ID</label>
              <input
                type="text"
                placeholder="e.g. rss-feeds"
                className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-white focus:ring-2 focus:ring-secondary focus:border-transparent"
                value={config.bucketId}
                onChange={e => {
                  setConfig({ ...config, bucketId: e.target.value });
                  setStatus('idle');
                  setErrorMessage('');
                }}
                required
              />
              <p className="text-xs text-slate-500 mt-1">
                Ensure this bucket has <strong>Public (Any)</strong> read permissions.
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1">Function ID (Optional for Static, Required for Dynamic)</label>
              <input
                type="text"
                placeholder="e.g. rss-generator"
                className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-white focus:ring-2 focus:ring-secondary focus:border-transparent"
                value={config.functionId || ''}
                onChange={e => {
                  setConfig({ ...config, functionId: e.target.value });
                  setStatus('idle');
                  setErrorMessage('');
                }}
              />
              <p className="text-xs text-slate-500 mt-1">
                Deploy the backend function to enable auto-updating feeds.
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1">Function Domain (Required for GET access)</label>
              <input
                type="text"
                placeholder="e.g. rss-generator.appwrite.global"
                className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-white focus:ring-2 focus:ring-secondary focus:border-transparent"
                value={config.functionDomain || ''}
                onChange={e => {
                  setConfig({ ...config, functionDomain: e.target.value });
                  setStatus('idle');
                  setErrorMessage('');
                }}
              />
              <p className="text-xs text-slate-500 mt-1 flex justify-between items-center">
                <span>The domain assigned to your function.</span>
                {!config.functionDomain && config.projectId && (
                  <button
                    type="button"
                    className="text-primary hover:underline hover:text-primary/80"
                    onClick={() => setConfig({ ...config, functionDomain: `rss-generator.${config.projectId}.appwrite.global` })}
                  >
                    Use Default
                  </button>
                )}
              </p>
            </div>

            {/* Connection Status Message */}
            {status === 'success' && (
              <div className="flex items-center gap-2 text-green-400 text-sm bg-green-500/10 p-3 rounded-lg border border-green-500/20 animate-in fade-in slide-in-from-top-2">
                <Check className="w-4 h-4" /> Connection successful!
              </div>
            )}
            {status === 'error' && (
              <div className="space-y-3 animate-in fade-in slide-in-from-top-2">
                <div className="flex items-start gap-2 text-red-400 text-sm bg-red-500/10 p-3 rounded-lg border border-red-500/20">
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>{errorMessage}</span>
                </div>

                {errorMessage.includes("Network Error") && (
                  <div className="bg-slate-800/50 border border-slate-700 rounded-lg p-4 text-xs space-y-2">
                    <h4 className="font-bold text-slate-200 uppercase tracking-wider flex items-center gap-2">
                      <Globe className="w-3 h-3" />
                      How to fix this:
                    </h4>
                    <ol className="list-decimal list-inside space-y-1.5 text-slate-400">
                      <li>Open your <strong>Appwrite Console</strong>.</li>
                      <li>Go to <strong>Settings</strong> (bottom left).</li>
                      <li>Scroll down to the <strong>Platforms</strong> section.</li>
                      <li>Click <strong>Add Platform</strong> → <strong>Web App</strong>.</li>
                      <li>Enter a name (e.g., "RSS Gen AI") and for <strong>Hostname</strong> enter:
                        <div className="flex items-center gap-2 mt-1">
                          <code className="bg-slate-900 px-1.5 py-0.5 rounded text-secondary font-mono">{currentHostname}</code>
                          <button
                            type="button"
                            onClick={() => {
                              navigator.clipboard.writeText(currentHostname);
                              alert("Hostname copied to clipboard!");
                            }}
                            className="p-1 hover:bg-slate-700 rounded transition-colors text-slate-400"
                            title="Copy Hostname"
                          >
                            <span className="text-[10px] uppercase font-bold px-1">Copy</span>
                          </button>
                        </div>
                      </li>
                      <li>Click <strong>Register</strong> and try the test again here.</li>
                    </ol>
                  </div>
                )}
              </div>
            )}
          </form>
        </div>

        <div className="p-4 border-t border-slate-700 bg-slate-900/50 flex gap-3">
          <Button
            type="button"
            variant="secondary"
            onClick={handleTestConnection}
            isLoading={status === 'testing'}
            disabled={!config.endpoint || !config.projectId || !config.bucketId}
            className="mr-auto"
          >
            <Wifi className="w-4 h-4 mr-2" />
            Test
          </Button>

          <Button type="button" variant="ghost" onClick={handleClear} className="text-red-400 hover:text-red-300 hover:bg-red-900/20">
            Clear
          </Button>
          <Button type="submit" form="settings-form" variant="primary">
            {saveStatus === 'saved' ? 'Saved!' : 'Save'}
          </Button>
        </div>
      </div>
    </div>
  );
};