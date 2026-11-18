import React from 'react';
import { UserSettings } from '../../types';
export const SettingsBilling: React.FC<{ settings: UserSettings; updateSettings: (settings: Partial<UserSettings>) => void; onOpenUpgrade: () => void }> = () => <div className="space-y-4 text-sm"><h3>Private API instance</h3><p className="text-claude-text-secondary">No app subscription, payment processing, or plan quotas. API requests may incur charges at your server-configured provider. Credentials are kept on the server.</p></div>;
