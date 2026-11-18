import { ModelOption } from '../types';
export const PRIMARY_MODELS: ModelOption[] = [{ id: 'opus-5', name: 'Claude Opus 5.5', shortName: 'Opus 5.5', description: 'Private API · adaptive thinking · high effort', supportsThinking: true }];
export const MORE_MODELS: ModelOption[] = [];
export const ALL_MODELS = PRIMARY_MODELS;
export const PROMPT_STARTERS = [
  { category: 'learn', title: 'Explain a concept', description: 'Learn something new with clear examples', prompt: 'Explain quantum computing using clear analogies.' },
  { category: 'write', title: 'Improve my writing', description: 'Draft and refine your ideas', prompt: 'Help me outline a clear technical blog post.' },
  { category: 'code', title: 'Review some code', description: 'Discuss design and implementation', prompt: 'Help me review code for correctness, security, and clarity.' }
];
