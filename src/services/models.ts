import { ModelProfileId } from '../types';

const modelIds: ModelProfileId[] = ['opus-5', 'fable-5', 'sonnet-5', 'haiku-4.5', 'opus-4.8', 'opus-4.7', 'opus-4.6', 'opus-3', 'sonnet-4.5', 'gpt-6-astra', 'gpt-6.1-sol'];
export const validModel = (value: unknown): value is ModelProfileId => typeof value === 'string' && modelIds.includes(value as ModelProfileId);
const storageKey = 'chat_model_v1';
export function loadSelectedModel(): ModelProfileId {
  try { const saved = localStorage.getItem(storageKey); if (validModel(saved)) return saved; } catch { /* Private mode / disabled storage. */ }
  return 'opus-5';
}
export function persistSelectedModel(model: ModelProfileId): void {
  if (!validModel(model)) return;
  try { localStorage.setItem(storageKey, model); } catch { /* In-memory selection remains usable. */ }
}
export function modelName(model: ModelProfileId): string {
  if (model.startsWith('gpt-')) return model;
  const names: Partial<Record<ModelProfileId, string>> = { 'opus-5': 'Claude Opus 5.5', 'fable-5': 'Claude Fable 5', 'sonnet-5': 'Claude Sonnet 5', 'haiku-4.5': 'Claude Haiku 4.5', 'opus-4.8': 'Claude Opus 4.8', 'opus-4.7': 'Claude Opus 4.7', 'opus-4.6': 'Claude Opus 4.6', 'opus-3': 'Claude Opus 3', 'sonnet-4.5': 'Claude Sonnet 4.5' };
  return names[model] || model;
}
