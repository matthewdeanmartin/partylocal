import type { Question, Slot } from 'party-core';

/** Editing the first prompt must not replace its type, choices or other questions. */
export function editFirstQuestion(questions: Question[], prompt: string): Question[] {
  if (!questions.length) return prompt ? [{ id: 0, kind: 'yesno', prompt, choices: [] }] : [];
  return questions.map((q, i) => i === 0 ? { ...q, prompt, choices: [...q.choices] } : q);
}

/** Match by name, not position: existing claims belong to a slot's id. */
export function editBringList(previous: Slot[], text: string): Slot[] {
  const remaining = [...previous];
  return text.split(',').map(s => s.trim()).filter(Boolean).map(s => {
    const match = /^(.*?)\s+x\s*(\d+)$/i.exec(s);
    const name = (match ? match[1] : s).trim();
    const index = remaining.findIndex(item => item.name === name);
    const old = index >= 0 ? remaining.splice(index, 1)[0] : undefined;
    return { id: old?.id ?? 0, name, count: match ? Number(match[2]) : 1 };
  });
}

/** Names using the short form's separators need a structured editor. */
export function needsStructuredBring(items: Slot[]): boolean {
  return items.some(item => item.name.includes(',') || /\s+x\s*\d+$/i.test(item.name));
}

/** Reordered text rows keep ids only when they still describe the same item. */
export function keepItemIds<T extends { id: number }>(previous: T[], next: T[], same: (a: T, b: T) => boolean): T[] {
  const remaining = [...previous];
  return next.map(item => {
    const index = remaining.findIndex(old => same(old, item));
    const old = index >= 0 ? remaining.splice(index, 1)[0] : undefined;
    return { ...item, id: old?.id ?? 0 };
  });
}
