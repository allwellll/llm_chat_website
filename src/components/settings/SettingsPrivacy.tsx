import React, { useState } from 'react';
import { ArrowRight, Download, Trash2 } from 'lucide-react';
import { UserSettings } from '../../types';
import { useChat } from '../../context/ChatContext';

interface SettingsTabProps {
  settings: UserSettings;
  updateSettings: (newSettings: Partial<UserSettings>) => void;
}

export const SettingsPrivacy: React.FC<SettingsTabProps> = ({ settings, updateSettings }) => {
  const [showPrivacyDetail, setShowPrivacyDetail] = useState(false);
  const { clearAllConversations } = useChat();

  const handleExportData = () => {
    const exportPayload = {
      user: {
        name: settings.userName,
        email: settings.userEmail,
        role: settings.userRole
      },
      settings,
      exportedAt: new Date().toISOString()
    };
    const blob = new Blob([JSON.stringify(exportPayload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `claude-data-export-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-8 max-w-xl">
      <div>
        <h3 className="text-sm font-semibold text-claude-text-primary mb-1">Privacy</h3>
        <p className="text-xs text-claude-text-secondary">Control how your data and conversations are processed.</p>
      </div>

      <div
        onClick={() => setShowPrivacyDetail(!showPrivacyDetail)}
        className="flex items-center justify-between p-4 rounded-2xl bg-claude-card border border-claude-border hover:border-[#DA7756]/50 cursor-pointer transition-all"
      >
        <div className="space-y-0.5">
          <div className="text-xs font-medium text-claude-text-primary">How we use your data</div>
          <p className="text-[11px] text-claude-text-secondary">Encrypted transit, local storage isolation, zero leakage</p>
        </div>
        <ArrowRight className="w-4 h-4 text-claude-text-secondary" />
      </div>

      <div className="space-y-4">
        <h4 className="text-xs font-semibold text-claude-text-primary">Preferences</h4>
        
        <div className="flex items-center justify-between p-3.5 rounded-2xl bg-claude-card border border-claude-border">
          <div>
            <span className="text-xs font-medium text-claude-text-primary">Location metadata</span>
            <p className="text-[11px] text-claude-text-secondary">Attach approximate timezone & region for localized prompts</p>
          </div>
          <input
            type="checkbox"
            checked={settings.privacy.locationMetadata}
            onChange={(e) =>
              updateSettings({
                privacy: { ...settings.privacy, locationMetadata: e.target.checked }
              })
            }
            className="w-4 h-4 accent-[#DA7756]"
          />
        </div>

        <div className="flex items-center justify-between p-3.5 rounded-2xl bg-claude-card border border-claude-border">
          <div>
            <span className="text-xs font-medium text-claude-text-primary">Improve AI models</span>
            <p className="text-[11px] text-claude-text-secondary">Allow anonymized conversation feedback to tune evaluation suites</p>
          </div>
          <input
            type="checkbox"
            checked={settings.privacy.improveAiModels}
            onChange={(e) =>
              updateSettings({
                privacy: { ...settings.privacy, improveAiModels: e.target.checked }
              })
            }
            className="w-4 h-4 accent-[#DA7756]"
          />
        </div>
      </div>

      <div className="space-y-3">
        <h4 className="text-xs font-semibold text-claude-text-primary">Your data</h4>

        <div className="flex items-center justify-between p-3.5 rounded-2xl bg-claude-card border border-claude-border">
          <div>
            <span className="text-xs font-medium text-claude-text-primary">Export data</span>
            <p className="text-[11px] text-claude-text-secondary">Download all chats, memories, and settings in JSON</p>
          </div>
          <button
            onClick={handleExportData}
            className="px-3 py-1.5 rounded-xl bg-claude-surface hover:bg-claude-card-hover text-xs font-medium text-claude-text-primary border border-claude-border transition-colors flex items-center gap-1.5"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Export data</span>
          </button>
        </div>

        <div className="flex items-center justify-between p-3.5 rounded-2xl bg-claude-card border border-claude-border">
          <div>
            <span className="text-xs font-medium text-claude-text-primary">Clear all chat history</span>
            <p className="text-[11px] text-claude-text-secondary">Delete all local conversations permanently</p>
          </div>
          <button
            onClick={() => {
              if (window.confirm('Delete all conversations?')) {
                clearAllConversations();
              }
            }}
            className="px-3 py-1.5 rounded-xl bg-red-950/40 hover:bg-red-900/50 text-xs font-medium text-red-300 border border-red-800/50 transition-colors flex items-center gap-1.5"
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span>Clear chats</span>
          </button>
        </div>
      </div>
    </div>
  );
};
