import React, { useEffect, useSyncExternalStore } from 'react';
import { channelSnapshot, loadChannels, selectChannel, subscribeChannels } from '../services/channels';

export const ChannelSelector: React.FC = () => {
  const { channels, selected, error } = useSyncExternalStore(subscribeChannels, channelSnapshot);
  useEffect(() => { void loadChannels().catch(() => {}); }, []);
  return (
    <div className="flex min-w-0 items-center justify-end gap-2 px-4 pb-1 text-xs text-claude-text-secondary">
      <label htmlFor="upstream-channel">渠道</label>
      <select
        id="upstream-channel"
        aria-label="上游渠道"
        title="仅切换上游渠道，模型和网页检索设置不变；选择保存在当前浏览器"
        className="min-w-0 max-w-[180px] rounded-lg border border-claude-border bg-claude-card px-2 py-1 text-xs text-claude-text-primary focus:outline-none focus:ring-1 focus:ring-[#DA7756]"
        value={selected}
        disabled={!channels.length}
        onChange={event => selectChannel(event.target.value)}
      >
        {!channels.length && <option value="">{error ? '默认渠道' : '加载中…'}</option>}
        {channels.map(channel => <option key={channel.id} value={channel.id}>{channel.label}</option>)}
      </select>
      {error && <button type="button" onClick={() => { void loadChannels().catch(() => {}); }} className="shrink-0 hover:underline">重试</button>}
    </div>
  );
};
