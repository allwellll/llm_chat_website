import { ModelProfileId } from '../types';

export interface UpstreamChannel { id: string; label: string; protocol?: 'responses'; models?: string[] }
interface ChannelState { channels: UpstreamChannel[]; selected: string; error: boolean }
const storageKey = 'claude_channel_v1';
let state: ChannelState = { channels: [], selected: '', error: false };
let pending: Promise<void> | undefined;
const listeners = new Set<() => void>();
const publish = (next: ChannelState) => { state = next; listeners.forEach(listener => listener()); };
export const subscribeChannels = (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; };
export const channelSnapshot = () => state;
export const isGptModel = (model: ModelProfileId) => model === 'gpt-6-astra' || model === 'gpt-6.1-sol';
export const channelSupportsModel = (channel: UpstreamChannel, model: ModelProfileId) => isGptModel(model)
  ? channel.protocol === 'responses' && channel.models?.includes(model) === true
  : channel.protocol !== 'responses';
export const channelForModel = (model: ModelProfileId) => state.channels.find(c => c.id === state.selected && channelSupportsModel(c, model))
  || state.channels.find(c => channelSupportsModel(c, model));

export async function loadChannels(): Promise<void> {
  if (state.channels.length) return;
  if (!pending) {
    pending = (async () => {
      const response = await fetch(`${import.meta.env.BASE_URL}api/channels`);
      if (!response.ok) throw new Error('Channel metadata unavailable');
      const metadata = await response.json();
      if (!Array.isArray(metadata.channels) || !metadata.channels.length
        || !metadata.channels.every((c: UpstreamChannel) => c && typeof c.id === 'string' && typeof c.label === 'string'
          && (c.protocol === undefined || c.protocol === 'responses')
          && (c.models === undefined || (Array.isArray(c.models) && c.models.every(m => typeof m === 'string'))))
        || !metadata.channels.some((c: UpstreamChannel) => c.id === metadata.defaultChannel)) throw new Error('Invalid channel metadata');
      // Deliberately retain public metadata only, never credentials or endpoints.
      const channels: UpstreamChannel[] = metadata.channels.map(({ id, label, protocol, models }: UpstreamChannel) => ({ id, label, ...(protocol ? { protocol } : {}), ...(models ? { models: [...models] } : {}) }));
      let saved: string | null = null;
      try { saved = localStorage.getItem(storageKey); } catch { /* Storage may be disabled. */ }
      publish({ channels, selected: channels.some(c => c.id === saved && c.protocol !== 'responses') ? saved! : metadata.defaultChannel, error: false });
    })().catch(error => { publish({ ...state, error: true }); throw error; }).finally(() => { pending = undefined; });
  }
  return pending;
}
export function selectChannel(id: string): void {
  const channel = state.channels.find(c => c.id === id);
  if (!channel) return;
  // Keep the remembered Claude group when temporarily choosing a GPT model.
  if (channel.protocol !== 'responses') {
    try { localStorage.setItem(storageKey, id); } catch { /* In-memory choice still works. */ }
  }
  publish({ ...state, selected: id });
}
export async function selectedRequestChannel(model: ModelProfileId): Promise<string | undefined> {
  // Metadata failure is not permission to send one provider's model to another key.
  await loadChannels();
  const channel = channelForModel(model);
  if (!channel) throw new Error('所选模型没有可用的兼容分组，请选择其他模型或重试');
  return channel.id;
}
