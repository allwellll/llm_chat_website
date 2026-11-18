import React from 'react';
import { UserSettings } from '../../types';
export const SettingsCode: React.FC<{ settings: UserSettings; updateSettings: (settings: Partial<UserSettings>) => void }> = () => <div className="space-y-4 text-sm"><h3>Code assistance</h3><p className="text-claude-text-secondary">Chat can explain and generate code. Terminal execution, GitHub integration, automatic pull requests and Claude Code sessions are not enabled.</p></div>;
