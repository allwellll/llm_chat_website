import React from 'react';
import { UserSettings } from '../../types';

interface SettingsTabProps {
  settings: UserSettings;
  updateSettings: (newSettings: Partial<UserSettings>) => void;
}

export const SettingsTimeFocus: React.FC<SettingsTabProps> = ({ settings, updateSettings }) => {
  return (
    <div className="space-y-8 max-w-xl">
      <div>
        <h3 className="text-sm font-semibold text-claude-text-primary mb-1">Time and focus</h3>
        <p className="text-xs text-claude-text-secondary">Schedule quiet hours and break reminders.</p>
      </div>

      <div className="space-y-4">
        <h4 className="text-xs font-semibold text-claude-text-primary">Break reminders</h4>

        <div className="flex items-center justify-between p-3.5 rounded-2xl bg-claude-card border border-claude-border">
          <div>
            <span className="text-xs font-medium text-claude-text-primary">Enable break reminders</span>
            <p className="text-[11px] text-claude-text-secondary">Gentle prompt after continuous coding intervals</p>
          </div>
          <input
            type="checkbox"
            checked={settings.timeAndFocus.breakReminders}
            onChange={(e) =>
              updateSettings({
                timeAndFocus: { ...settings.timeAndFocus, breakReminders: e.target.checked }
              })
            }
            className="w-4 h-4 accent-[#DA7756]"
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <label className="block text-xs font-medium text-claude-text-secondary">Break interval</label>
            <select
              value={settings.timeAndFocus.breakInterval}
              onChange={(e) =>
                updateSettings({
                  timeAndFocus: { ...settings.timeAndFocus, breakInterval: e.target.value }
                })
              }
              className="w-full bg-claude-card text-xs text-claude-text-primary px-3.5 py-2 rounded-xl border border-claude-border focus:outline-none"
            >
              <option value="30 minutes">30 minutes</option>
              <option value="45 minutes">45 minutes</option>
              <option value="1 hour">1 hour</option>
              <option value="2 hours">2 hours</option>
            </select>
          </div>

          <div className="space-y-1.5">
            <label className="block text-xs font-medium text-claude-text-secondary">Snooze duration</label>
            <select
              value={settings.timeAndFocus.snoozeDuration}
              onChange={(e) =>
                updateSettings({
                  timeAndFocus: { ...settings.timeAndFocus, snoozeDuration: e.target.value }
                })
              }
              className="w-full bg-claude-card text-xs text-claude-text-primary px-3.5 py-2 rounded-xl border border-claude-border focus:outline-none"
            >
              <option value="5 minutes">5 minutes</option>
              <option value="10 minutes">10 minutes</option>
              <option value="15 minutes">15 minutes</option>
            </select>
          </div>
        </div>
      </div>

      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h4 className="text-xs font-semibold text-claude-text-primary">Quiet hours</h4>
          <input
            type="checkbox"
            checked={settings.timeAndFocus.quietHoursEnabled}
            onChange={(e) =>
              updateSettings({
                timeAndFocus: { ...settings.timeAndFocus, quietHoursEnabled: e.target.checked }
              })
            }
            className="w-4 h-4 accent-[#DA7756]"
          />
        </div>

        <p className="text-[11px] text-claude-text-secondary">
          Mute notifications and sound feedback during chosen days and times.
        </p>

        <div className="flex items-center gap-2">
          {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((day, idx) => {
            const isDayActive = settings.timeAndFocus.quietHoursDays.includes(idx);
            return (
              <button
                key={idx}
                onClick={() => {
                  const current = settings.timeAndFocus.quietHoursDays;
                  const next = current.includes(idx)
                    ? current.filter((d) => d !== idx)
                    : [...current, idx];
                  updateSettings({
                    timeAndFocus: { ...settings.timeAndFocus, quietHoursDays: next }
                  });
                }}
                className={`w-8 h-8 rounded-full text-xs font-semibold flex items-center justify-center transition-all ${
                  isDayActive
                    ? 'bg-[#DA7756] text-white shadow'
                    : 'bg-claude-card text-claude-text-muted border border-claude-border hover:text-claude-text-primary'
                }`}
              >
                {day}
              </button>
            );
          })}
        </div>

        <div className="grid grid-cols-2 gap-3 pt-2">
          <div className="space-y-1.5">
            <label className="block text-xs font-medium text-claude-text-secondary">Start time</label>
            <input
              type="time"
              value={settings.timeAndFocus.quietHoursStart}
              onChange={(e) =>
                updateSettings({
                  timeAndFocus: { ...settings.timeAndFocus, quietHoursStart: e.target.value }
                })
              }
              className="w-full bg-claude-card text-xs text-claude-text-primary px-3.5 py-2 rounded-xl border border-claude-border focus:outline-none"
            />
          </div>

          <div className="space-y-1.5">
            <label className="block text-xs font-medium text-claude-text-secondary">End time</label>
            <input
              type="time"
              value={settings.timeAndFocus.quietHoursEnd}
              onChange={(e) =>
                updateSettings({
                  timeAndFocus: { ...settings.timeAndFocus, quietHoursEnd: e.target.value }
                })
              }
              className="w-full bg-claude-card text-xs text-claude-text-primary px-3.5 py-2 rounded-xl border border-claude-border focus:outline-none"
            />
          </div>
        </div>
      </div>
    </div>
  );
};
