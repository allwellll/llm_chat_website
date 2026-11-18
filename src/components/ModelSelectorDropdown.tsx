import React, { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { ChevronDown, Check } from 'lucide-react';
import { channelSnapshot, channelForModel, loadChannels, selectChannel, subscribeChannels } from '../services/channels';
import { useChat } from '../context/ChatContext';
import { ModelProfileId } from '../types';
import { modelName } from '../services/models';

export const ModelSelectorDropdown: React.FC = () => {
  const [open, setOpen] = useState(false);
  const { channels, error } = useSyncExternalStore(subscribeChannels, channelSnapshot);
  const { selectedModel, setSelectedModel } = useChat();
  const selected = channelForModel(selectedModel)?.id;
  const name = modelName(selectedModel);
  const entries = channels.flatMap(channel => channel.protocol === 'responses'
    ? (channel.models || []).filter((model): model is 'gpt-6-astra' | 'gpt-6.1-sol' => model === 'gpt-6-astra' || model === 'gpt-6.1-sol').map(model => ({ channel, model: model as ModelProfileId }))
    : [{ channel, model: 'opus-5' as ModelProfileId }]);
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const selectedLabel = channels.find(channel => channel.id === selected)?.label;
  useEffect(() => { void loadChannels().catch(() => {}); }, []);
  useEffect(() => {
    if (!open) return;
    const dismiss = (event: PointerEvent) => { if (!root.current?.contains(event.target as Node)) setOpen(false); };
    const escape = (event: KeyboardEvent) => { if (event.key === 'Escape') { setOpen(false); trigger.current?.focus(); } };
    document.addEventListener('pointerdown', dismiss);
    document.addEventListener('keydown', escape);
    return () => { document.removeEventListener('pointerdown', dismiss); document.removeEventListener('keydown', escape); };
  }, [open]);
  return <div ref={root} className="model-channel-picker relative min-w-0 text-xs">
    <button ref={trigger} type="button" aria-label={`选择模型：${name}，${selectedLabel || '无可用分组'}`} aria-haspopup="menu" aria-expanded={open}
      onClick={() => setOpen(!open)} className="model-channel-trigger flex min-w-0 items-center gap-1.5 rounded-xl px-2 py-1 hover:bg-claude-surface text-claude-text-primary transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#DA7756]">
      <span className="flex min-w-0 flex-col items-start leading-tight">
        <span className="max-w-[122px] truncate font-medium">{name.replace(/^Claude /, '')}</span>
        <span data-model-channel-label className="mt-0.5 max-w-[122px] truncate text-[10px] font-normal text-claude-text-muted">{selectedLabel || (channels.length ? '无可用分组' : error ? '分组加载失败' : '加载中…')}</span>
      </span>
      <ChevronDown size={12} className={`shrink-0 text-claude-text-muted transition-transform ${open ? 'rotate-180' : ''}`} />
    </button>
    {open && <div role="menu" aria-label="模型与分组" className="absolute right-0 bottom-full mb-2 w-[272px] max-w-[calc(100vw-32px)] rounded-2xl border border-claude-border bg-claude-card p-1.5 z-50 shadow-xl">
      <div className="px-3 pt-2 pb-2.5 text-[10px] font-medium tracking-wider text-claude-text-muted">模型与分组</div>
      {entries.map(({channel, model}) => <button key={`${channel.id}:${model}`} type="button" role="menuitemradio" aria-checked={selected === channel.id && selectedModel === model} aria-label={`${modelName(model)} ${channel.label}`}
        onClick={() => { selectChannel(channel.id); setSelectedModel(model); setOpen(false); trigger.current?.focus(); }}
        className={`flex w-full items-center justify-between gap-3 rounded-xl px-3 py-2.5 text-left transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#DA7756] ${selected === channel.id && selectedModel === model ? 'bg-claude-surface' : 'hover:bg-claude-surface'}`}>
        <span className="min-w-0">
          <span data-model-name className="block text-[13px] font-medium text-claude-text-primary">{modelName(model)}</span>
          <span data-group-name className="mt-1 block truncate text-[11px] font-normal text-claude-text-muted">{channel.label}</span>
        </span>
        {selected === channel.id && selectedModel === model && <Check size={15} className="shrink-0 text-[#DA7756]" aria-hidden="true" />}
      </button>)}
      {!channels.length && <button type="button" role="menuitem" onClick={() => { void loadChannels().catch(() => {}); }} className="w-full rounded-xl px-3 py-3 text-left text-claude-text-secondary">{error ? '分组加载失败，点击重试' : '正在加载分组…'}</button>}
      <div className="mx-3 mt-2 border-t border-claude-border-subtle pt-2 pb-1.5 text-[10px] text-claude-text-muted">选择模型与分组 · High 推理</div>
    </div>}
  </div>;
};
