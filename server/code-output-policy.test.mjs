import test from 'node:test';
import assert from 'node:assert/strict';
import { chatPayload } from './local.mjs';
const policy = '仅当用户明确要求生成代码时，才使用上述代码及 Artifact 输出方式；其他任务直接正常回答。';
test('code output requires explicit user request, including existing saved instructions', () => {
  for (const systemPrompt of ['', 'When providing code, use TypeScript/React and antArtifact.']) {
    const payload = chatPayload({messages:[{role:'user',content:'帮我分析购机方案'}],systemPrompt},{},new Date('2026-10-20T06:00:00Z'));
    assert.ok(payload.system.includes(policy));
    if (systemPrompt) assert.ok(payload.system.startsWith(systemPrompt));
    assert.ok(payload.system.indexOf(policy) < payload.system.indexOf('[当前时间信息]'));
  }
});
