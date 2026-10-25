import { describe, expect, it } from 'vitest';
import { editBringList, editFirstQuestion, needsStructuredBring } from './event-editing';
import type { Question } from 'party-core';

describe('simplified editors preserve rich event data', () => {
  const questions: Question[] = [
    { id: 10, kind: 'choice', prompt: 'Which meal?', choices: ['Soup', 'Salad'] },
    { id: 11, kind: 'text', prompt: 'Anything else?', choices: [] },
  ];

  it('changes a prompt without replacing types, choices, ids or later questions', () => {
    const edited = editFirstQuestion(questions, 'Which lunch?');
    expect(edited).toEqual([{ ...questions[0], prompt: 'Which lunch?' }, questions[1]]);
    expect(questions[0].prompt).toBe('Which meal?');
  });

  it('keeps the original question while its prompt is temporarily empty', () => {
    const cleared = editFirstQuestion(questions, '');
    expect(cleared).toHaveLength(2);
    expect(editFirstQuestion(cleared, 'New prompt')[0]).toEqual({ ...questions[0], prompt: 'New prompt' });
  });

  it('still creates a yes/no question for a new event', () => {
    expect(editFirstQuestion([], '')).toEqual([]);
    expect(editFirstQuestion([], 'Coming?')).toEqual([{ id: 0, kind: 'yesno', prompt: 'Coming?', choices: [] }]);
  });

  it('keeps claims attached to the same item after insertion, reorder or removal', () => {
    const old = [{ id: 1, name: 'Salad', count: 2 }, { id: 2, name: 'Pie', count: 1 }];
    expect(editBringList(old, 'Pie, Chairs x3, Salad x4')).toEqual([
      { id: 2, name: 'Pie', count: 1 }, { id: 0, name: 'Chairs', count: 3 }, { id: 1, name: 'Salad', count: 4 },
    ]);
    expect(editBringList(old, 'Pie')[0].id).toBe(2);
    expect(editBringList(old, 'Soup')[0].id).toBe(0);
  });

  it('never reuses an id twice for duplicate names or strips articles from names', () => {
    const old = [{ id: 8, name: 'Some chairs', count: 1 }];
    expect(editBringList(old, 'Some chairs, Some chairs').map(s => s.id)).toEqual([8, 0]);
  });

  it('identifies names that cannot round-trip through the short list format', () => {
    expect(needsStructuredBring([{ id: 1, name: 'Salt, pepper', count: 1 }])).toBe(true);
    expect(needsStructuredBring([{ id: 1, name: 'Box x2', count: 1 }])).toBe(true);
    expect(needsStructuredBring([{ id: 1, name: 'Chairs', count: 2 }])).toBe(false);
  });
});
