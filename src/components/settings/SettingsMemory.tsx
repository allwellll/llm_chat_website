import React, { useState } from 'react';
import { Trash2 } from 'lucide-react';
import { UserSettings, MemoryItem } from '../../types';

interface SettingsTabProps {
  settings: UserSettings;
  updateSettings: (newSettings: Partial<UserSettings>) => void;
}

export const SettingsMemory: React.FC<SettingsTabProps> = ({ settings, updateSettings }) => {
  const [newMemoryText, setNewMemoryText] = useState('');

  const handleAddMemory = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMemoryText.trim()) return;
    const newMem: MemoryItem = {
      id: `mem-${Date.now()}`,
      content: newMemoryText.trim(),
      createdAt: Date.now(),
      category: 'General'
    };
    updateSettings({
      memory: {
        ...settings.memory,
        items: [newMem, ...settings.memory.items]
      }
    });
    setNewMemoryText('');
  };

  const handleDeleteMemory = (memId: string) => {
    updateSettings({
      memory: {
        ...settings.memory,
        items: settings.memory.items.filter((m) => m.id !== memId)
      }
    });
  };

  const handleClearAllMemory = () => {
    if (window.confirm('Clear all stored memories?')) {
      updateSettings({
        memory: {
          ...settings.memory,
          items: []
        }
      });
    }
  };

  return (
    <div className="space-y-6 max-w-xl">
      <div className="flex items-start justify-between">
        <div>
          <h3 className="text-sm font-semibold text-claude-text-primary mb-1">Memory</h3>
          <p className="text-xs text-claude-text-secondary">Preferences and facts remembered across conversation sessions.</p>
        </div>
        <input
          type="checkbox"
          checked={settings.memory.enabled}
          onChange={(e) =>
            updateSettings({
              memory: { ...settings.memory, enabled: e.target.checked }
            })
          }
          className="w-4 h-4 accent-[#DA7756]"
        />
      </div>

      <form onSubmit={handleAddMemory} className="flex gap-2">
        <input
          type="text"
          placeholder="Add a fact to remember (e.g. Prefers Tailwind CSS)"
          value={newMemoryText}
          onChange={(e) => setNewMemoryText(e.target.value)}
          className="flex-1 bg-claude-card text-xs text-claude-text-primary px-3.5 py-2 rounded-xl border border-claude-border focus:outline-none focus:border-[#DA7756]"
        />
        <button
          type="submit"
          className="px-3 py-2 rounded-xl bg-claude-surface hover:bg-claude-input text-xs font-medium text-claude-text-primary border border-claude-border transition-colors"
        >
          Add
        </button>
      </form>

      <div className="space-y-2.5">
        <div className="flex items-center justify-between text-xs text-claude-text-muted">
          <span>Saved memories ({settings.memory.items.length})</span>
          {settings.memory.items.length > 0 && (
            <button
              onClick={handleClearAllMemory}
              className="text-red-400 hover:underline text-[11px]"
            >
              Clear all
            </button>
          )}
        </div>

        {settings.memory.items.map((mem) => (
          <div
            key={mem.id}
            className="flex items-center justify-between p-3.5 rounded-2xl bg-claude-card border border-claude-border"
          >
            <span className="text-xs text-claude-text-primary pr-3">{mem.content}</span>
            <button
              onClick={() => handleDeleteMemory(mem.id)}
              className="p-1 text-claude-text-muted hover:text-red-400 shrink-0"
              title="Delete memory"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
        ))}

        {settings.memory.items.length === 0 && (
          <div className="p-4 rounded-2xl bg-claude-card border border-claude-border text-center text-xs text-claude-text-muted">
            No memories stored yet
          </div>
        )}
      </div>
    </div>
  );
};
