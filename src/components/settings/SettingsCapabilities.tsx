import React from 'react';
import { UserSettings } from '../../types';

interface SettingsTabProps {
  settings: UserSettings;
  updateSettings: (newSettings: Partial<UserSettings>) => void;
}

export const SettingsCapabilities: React.FC<SettingsTabProps> = ({ settings, updateSettings }) => {
  return (
    <div className="space-y-8 max-w-xl">
      <div>
        <h3 className="text-sm font-semibold text-claude-text-primary mb-1">Capabilities</h3>
        <p className="text-xs text-claude-text-secondary">Tool dispatch, model routing, and visual sandbox toggles.</p>
      </div>

      <div className="space-y-4">
        <h4 className="text-xs font-semibold text-claude-text-primary">General</h4>

        <div className="space-y-1.5">
          <label className="block text-xs font-medium text-claude-text-secondary">Tool access mode</label>
          <select
            value={settings.capabilities.toolAccessMode}
            onChange={(e) =>
              updateSettings({
                capabilities: { ...settings.capabilities, toolAccessMode: e.target.value as any }
              })
            }
            className="w-full bg-claude-card text-xs text-claude-text-primary px-3.5 py-2 rounded-xl border border-claude-border focus:outline-none focus:border-[#DA7756]"
          >
            <option value="needed">Load tools when needed</option>
            <option value="always">Always available</option>
            <option value="disabled">Disabled</option>
          </select>
        </div>

        <div className="flex items-center justify-between p-3.5 rounded-2xl bg-claude-card border border-claude-border">
          <div>
            <span className="text-xs font-medium text-claude-text-primary">Connector search</span>
            <p className="text-[11px] text-claude-text-secondary">Search connected services for relevant context</p>
          </div>
          <input
            type="checkbox"
            checked={settings.capabilities.connectorSearch}
            onChange={(e) =>
              updateSettings({
                capabilities: { ...settings.capabilities, connectorSearch: e.target.checked }
              })
            }
            className="w-4 h-4 accent-[#DA7756]"
          />
        </div>

        <div className="flex items-center justify-between p-3.5 rounded-2xl bg-claude-card border border-claude-border">
          <div>
            <span className="text-xs font-medium text-claude-text-primary">Switch models when a message is flagged</span>
            <p className="text-[11px] text-claude-text-secondary">Dynamically fall back to high-capacity profile if needed</p>
          </div>
          <input
            type="checkbox"
            checked={settings.capabilities.switchModelsFlagged}
            onChange={(e) =>
              updateSettings({
                capabilities: { ...settings.capabilities, switchModelsFlagged: e.target.checked }
              })
            }
            className="w-4 h-4 accent-[#DA7756]"
          />
        </div>
      </div>

      <div className="space-y-4">
        <h4 className="text-xs font-semibold text-claude-text-primary">Visuals</h4>

        <div className="flex items-center justify-between p-3.5 rounded-2xl bg-claude-card border border-claude-border">
          <div>
            <span className="text-xs font-medium text-claude-text-primary">Artifacts</span>
            <p className="text-[11px] text-claude-text-secondary">Generate documents and code in side-by-side workspace</p>
          </div>
          <input
            type="checkbox"
            checked={settings.capabilities.artifacts}
            onChange={(e) =>
              updateSettings({
                capabilities: { ...settings.capabilities, artifacts: e.target.checked }
              })
            }
            className="w-4 h-4 accent-[#DA7756]"
          />
        </div>

        <div className="flex items-center justify-between p-3.5 rounded-2xl bg-claude-card border border-claude-border">
          <div>
            <span className="text-xs font-medium text-claude-text-primary">Inline visualizations</span>
            <p className="text-[11px] text-claude-text-secondary">Interactive SVG diagrams and chart widgets in chat</p>
          </div>
          <input
            type="checkbox"
            checked={settings.capabilities.inlineVisualizations}
            onChange={(e) =>
              updateSettings({
                capabilities: { ...settings.capabilities, inlineVisualizations: e.target.checked }
              })
            }
            className="w-4 h-4 accent-[#DA7756]"
          />
        </div>
      </div>

      <div className="space-y-4">
        <h4 className="text-xs font-semibold text-claude-text-primary">Code execution and file creation</h4>

        <div className="flex items-center justify-between p-3.5 rounded-2xl bg-claude-card border border-claude-border">
          <div>
            <span className="text-xs font-medium text-claude-text-primary">Sandboxed code execution</span>
            <p className="text-[11px] text-claude-text-secondary">Execute JavaScript/React snippets in iframe sandbox</p>
          </div>
          <input
            type="checkbox"
            checked={settings.capabilities.codeExecution}
            onChange={(e) =>
              updateSettings({
                capabilities: { ...settings.capabilities, codeExecution: e.target.checked }
              })
            }
            className="w-4 h-4 accent-[#DA7756]"
          />
        </div>

        <div className="flex items-center justify-between p-3.5 rounded-2xl bg-claude-card border border-claude-border">
          <div>
            <span className="text-xs font-medium text-claude-text-primary">File creation & download</span>
            <p className="text-[11px] text-claude-text-secondary">Allow one-click downloading of generated artifacts</p>
          </div>
          <input
            type="checkbox"
            checked={settings.capabilities.fileCreation}
            onChange={(e) =>
              updateSettings({
                capabilities: { ...settings.capabilities, fileCreation: e.target.checked }
              })
            }
            className="w-4 h-4 accent-[#DA7756]"
          />
        </div>
      </div>
    </div>
  );
};
