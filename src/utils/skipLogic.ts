import { FormQuestion, SkipCondition, ValidationStatus } from '../types/kobo';

export function evaluateCondition(
  condition: SkipCondition,
  answers: Record<string, unknown>,
  questions: FormQuestion[]
): boolean {
  const targetQ = questions.find((q) => q.id === condition.questionId);
  if (!targetQ) return true;

  const rawValue = answers[targetQ.name] ?? answers[targetQ.id];
  const expected = condition.value ?? '';

  if (condition.operator === 'is_answered') {
    if (Array.isArray(rawValue)) return rawValue.length > 0;
    return rawValue !== undefined && rawValue !== null && String(rawValue).trim() !== '';
  }

  if (rawValue === undefined || rawValue === null || rawValue === '') {
    return condition.operator === 'not_equals';
  }

  if (Array.isArray(rawValue)) {
    const strArr = rawValue.map(String);
    if (condition.operator === 'contains' || condition.operator === 'equals') {
      return strArr.includes(expected);
    }
    if (condition.operator === 'not_equals') {
      return !strArr.includes(expected);
    }
    return false;
  }

  const strVal = String(rawValue).trim();

  switch (condition.operator) {
    case 'equals':
      return strVal === expected;
    case 'not_equals':
      return strVal !== expected;
    case 'contains':
      return strVal.toLowerCase().includes(expected.toLowerCase());
    case 'gt':
      return Number(strVal) > Number(expected);
    case 'lt':
      return Number(strVal) < Number(expected);
    default:
      return true;
  }
}

export function isQuestionVisible(
  question: FormQuestion,
  answers: Record<string, unknown>,
  allQuestions: FormQuestion[]
): boolean {
  if (question.type === 'hidden') return false;
  if (!question.skipLogic || question.skipLogic.conditions.length === 0) {
    return true;
  }

  const results = question.skipLogic.conditions.map((cond) =>
    evaluateCondition(cond, answers, allQuestions)
  );

  return question.skipLogic.match === 'any'
    ? results.some(Boolean)
    : results.every(Boolean);
}

export function evaluateFormula(
  formula: string | undefined,
  answers: Record<string, unknown>
): string | number {
  if (!formula) return '';
  try {
    // Safe arithmetic substitution using variable names ${var_name}
    const expr = formula.replace(/\$\{([a-zA-Z0-9_]+)\}/g, (_, varName: string) => {
      const val = answers[varName];
      const num = Number(val);
      return Number.isFinite(num) ? String(num) : '0';
    });
    // Allow only digits, spaces, parentheses, and basic arithmetic operators
    if (!/^[0-9+\-*/().\s]+$/.test(expr)) {
      return '';
    }
    const fn = new Function(`"use strict"; return (${expr});`);
    const result = fn();
    if (typeof result === 'number' && Number.isFinite(result)) {
      return Math.round(result * 100) / 100;
    }
    return '';
  } catch {
    return '';
  }
}

export const VALIDATION_STATUS_LABELS: Record<
  ValidationStatus,
  { label: string; colorClass: string; dotColor: string }
> = {
  approved: {
    label: 'معتمد',
    colorClass: 'text-emerald-700',
    dotColor: '#16a34a',
  },
  pending: {
    label: 'قيد المراجعة',
    colorClass: 'text-amber-700',
    dotColor: '#d97706',
  },
  on_hold: {
    label: 'معلّق للمتابعة',
    colorClass: 'text-sky-700',
    dotColor: '#0284c7',
  },
  rejected: {
    label: 'مرفوض',
    colorClass: 'text-rose-700',
    dotColor: '#dc2626',
  },
};

export function formatArabicDate(isoString: string | null | undefined): string {
  if (!isoString) return '—';
  const d = new Date(isoString);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('ar-SA', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

export function formatArabicDateTime(isoString: string | null | undefined): string {
  if (!isoString) return '—';
  const d = new Date(isoString);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString('ar-SA', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}
