import { describe, expect, it } from 'vitest';
import { todayKey, AI_TIMEZONE } from '../src/controllers/aichatController.js';

describe('AI daily usage helpers', () => {
  it('uses Africa/Addis_Ababa timezone for day key', () => {
    expect(AI_TIMEZONE).toBe('Africa/Addis_Ababa');
    expect(todayKey()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});
