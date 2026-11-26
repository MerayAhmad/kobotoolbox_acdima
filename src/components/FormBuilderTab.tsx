import React, { useState } from 'react';
import {
  ArrowDown,
  ArrowUp,
  BookOpen,
  Copy,
  Eye,
  GitBranch,
  Plus,
  Rocket,
  Save,
  Settings as SettingsIcon,
  Trash2,
  X,
} from 'lucide-react';
import { VETERINARY_LIBRARY_BLOCKS } from '../data/seedData';
import {
  QUESTION_TYPES,
  type FormQuestion,
  type LibraryBlock,
  type Project,
  type QuestionType,
  type SkipCondition,
  type SkipOperator,
} from '../types/kobo';

interface FormBuilderTabProps {
  project: Project;
  onSaveQuestions: (
    questions: FormQuestion[],
    deployNow?: boolean
  ) => Promise<void>;
  onOpenPreview: () => void;
}

const SKIP_OPERATOR_LABELS: Record<SkipOperator, string> = {
  equals: 'يساوي (=)',
  not_equals: 'لا يساوي (≠)',
  contains: 'يحتوي على',
  gt: 'أكبر من (>)',
  lt: 'أصغر من (<)',
  is_answered: 'تمت الإجابة عليه',
};

export const FormBuilderTab: React.FC<FormBuilderTabProps> = ({
  project,
  onSaveQuestions,
  onOpenPreview,
}) => {
  const [questions, setQuestions] = useState<FormQuestion[]>(project.questions);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [pickerIndex, setPickerIndex] = useState<number | null>(null);
  const [newQuestionDraftLabel, setNewQuestionDraftLabel] = useState('');
  const [editingSettingsId, setEditingSettingsId] = useState<string | null>(null);
  const [showLibraryModal, setShowLibraryModal] = useState(false);

  const updateQuestions = (next: FormQuestion[]) => {
    setQuestions(next);
    setDirty(true);
  };

  const handleOpenPickerAt = (idx: number) => {
    setPickerIndex(idx);
    setNewQuestionDraftLabel('');
  };

  const handleCreateQuestionOfType = (type: QuestionType) => {
    const meta = QUESTION_TYPES.find((t) => t.type === type);
    const id = `q_${Date.now()}_${Math.random().toString(36).slice(2, 5)}`;
    const name = `field_${questions.length + 1}_${type}`;
    const label = newQuestionDraftLabel.trim() || meta?.labelAr || 'سؤال جديد';

    const newQ: FormQuestion = {
      id,
      name,
      label,
      hint: '',
      type,
      required: false,
      ...(type === 'select_one' || type === 'select_multiple' || type === 'rank'
        ? {
            options: [
              { value: 'opt_1', label: 'الخيار الأول' },
              { value: 'opt_2', label: 'الخيار الثاني' },
            ],
          }
        : {}),
      ...(type === 'matrix'
        ? {
            matrixRows: ['الصنف الأول', 'الصنف الثاني'],
            matrixCols: ['ممتاز', 'جيد', 'ضعيف'],
          }
        : {}),
      ...(type === 'range'
        ? { rangeMin: 1, rangeMax: 10, rangeStep: 1 }
        : {}),
      ...(type === 'calculate' ? { formula: '${field_1} * 1' } : {}),
    };

    const insertIdx = pickerIndex !== null ? pickerIndex : questions.length;
    const next = [...questions];
    next.splice(insertIdx, 0, newQ);
    updateQuestions(next);
    setPickerIndex(null);
    setNewQuestionDraftLabel('');
  };

  const handleDuplicate = (idx: number) => {
    const source = questions[idx];
    const clone: FormQuestion = {
      ...JSON.parse(JSON.stringify(source)),
      id: `q_${Date.now()}_${Math.random().toString(36).slice(2, 5)}`,
      name: `${source.name}_copy`,
      label: `${source.label} (نسخة)`,
    };
    const next = [...questions];
    next.splice(idx + 1, 0, clone);
    updateQuestions(next);
  };

  const handleDelete = (id: string) => {
    updateQuestions(questions.filter((q) => q.id !== id));
    if (editingSettingsId === id) setEditingSettingsId(null);
  };

  const handleMove = (idx: number, dir: -1 | 1) => {
    const target = idx + dir;
    if (target < 0 || target >= questions.length) return;
    const next = [...questions];
    const [item] = next.splice(idx, 1);
    next.splice(target, 0, item);
    updateQuestions(next);
  };

  const handleInsertLibraryBlock = (block: LibraryBlock) => {
    const baseTime = Date.now();
    const mapped: FormQuestion[] = block.questions.map((q, i) => ({
      ...JSON.parse(JSON.stringify(q)),
      id: `q_lib_${baseTime}_${i}`,
      name: `${q.name}_${Math.floor(Math.random() * 100)}`,
    }));
    updateQuestions([...questions, ...mapped]);
    setShowLibraryModal(false);
  };

  const handleSave = async (deployNow = false) => {
    setSaving(true);
    try {
      await onSaveQuestions(questions, deployNow);
      setDirty(false);
    } finally {
      setSaving(false);
    }
  };

  const settingsQuestion = questions.find((q) => q.id === editingSettingsId) || null;
  const settingsQuestionIdx = questions.findIndex((q) => q.id === editingSettingsId);
  const previousQuestions =
    settingsQuestionIdx > 0 ? questions.slice(0, settingsQuestionIdx) : [];

  return (
    <div className="space-y-4">
      {/* KoboToolbox Form Builder Top Toolbar (Screenshot 3 style) */}
      <div className="bg-white border border-slate-200 rounded-lg px-4 py-3 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onOpenPreview}
            className="px-3 py-1.5 border border-slate-200 rounded-md text-xs font-medium text-slate-700 hover:bg-slate-50 inline-flex items-center gap-1.5 whitespace-nowrap shrink-0"
          >
            <Eye className="w-4 h-4 text-slate-500" />
            معاينة النموذج
          </button>
          <button
            type="button"
            onClick={() => setShowLibraryModal(true)}
            className="px-3 py-1.5 border border-slate-200 rounded-md text-xs font-medium text-slate-700 hover:bg-slate-50 inline-flex items-center gap-1.5 whitespace-nowrap shrink-0"
          >
            <BookOpen className="w-4 h-4 text-sky-600" />
            إضافة من المكتبة البيطرية
          </button>
          <span className="text-xs text-slate-500 tabular-nums hidden sm:inline">
            {questions.length} سؤالاً · يدعم 26 نوع سؤال
          </span>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => handleSave(false)}
            disabled={saving}
            className={`px-4 py-1.5 rounded-md text-xs font-semibold inline-flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0 ${
              dirty
                ? 'bg-sky-600 hover:bg-sky-700 text-white'
                : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
            }`}
          >
            <Save className="w-3.5 h-3.5" />
            {saving ? 'جارٍ الحفظ...' : dirty ? 'حفظ*' : 'محفوظ'}
          </button>
          <button
            type="button"
            onClick={() => handleSave(true)}
            disabled={saving}
            className="px-4 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-md text-xs font-semibold inline-flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0"
          >
            <Rocket className="w-3.5 h-3.5" />
            نشر النموذج
          </button>
        </div>
      </div>

      {/* Questions Canvas */}
      <div className="max-w-5xl mx-auto space-y-3">
        {questions.length === 0 && (
          <div className="bg-white border border-dashed border-slate-300 rounded-lg p-10 text-center space-y-3">
            <div className="text-sm font-medium text-slate-700">
              النموذج فارغ حالياً — ابدأ بإضافة أول سؤال أو استيراد قالب بيطري جاهز.
            </div>
            <div className="flex items-center justify-center gap-3">
              <button
                type="button"
                onClick={() => handleOpenPickerAt(0)}
                className="px-4 py-2 bg-sky-600 text-white rounded-md text-xs font-medium inline-flex items-center gap-1.5"
              >
                <Plus className="w-4 h-4" />
                إضافة سؤال
              </button>
              <button
                type="button"
                onClick={() => setShowLibraryModal(true)}
                className="px-4 py-2 border border-slate-300 bg-white text-slate-700 rounded-md text-xs font-medium"
              >
                استيراد من المكتبة
              </button>
            </div>
          </div>
        )}

        {questions.map((q, idx) => {
          const meta = QUESTION_TYPES.find((t) => t.type === q.type);
          const hasSkip = q.skipLogic && q.skipLogic.conditions.length > 0;

          return (
            <React.Fragment key={q.id}>
              <div className="bg-white border border-slate-200 rounded-md overflow-hidden flex items-stretch hover:border-sky-300 transition-colors">
                {/* Side Type Column (like KoboToolbox abc / 123 column) */}
                <div className="w-20 sm:w-24 bg-slate-50 border-l border-slate-200 flex flex-col items-center justify-center p-2 text-center shrink-0">
                  <span className="text-sm font-mono font-semibold text-slate-700">
                    {meta?.badge ?? q.type}
                  </span>
                  <span className="text-[11px] text-slate-500 mt-1 leading-tight">
                    {meta?.labelAr ?? q.type}
                  </span>
                </div>

                {/* Main Question Content */}
                <div className="flex-1 p-4 space-y-2.5 min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <input
                      type="text"
                      value={q.label}
                      onChange={(e) => {
                        const next = [...questions];
                        next[idx] = { ...q, label: e.target.value };
                        updateQuestions(next);
                      }}
                      className="flex-1 min-w-[200px] text-sm font-semibold text-slate-900 bg-transparent border-b border-transparent focus:border-sky-400 focus:outline-none py-0.5"
                      placeholder="نص السؤال..."
                    />
                    {q.required && (
                      <span className="text-xs text-rose-600 font-medium">* إلزامي</span>
                    )}
                    {hasSkip && (
                      <span className="text-xs text-sky-700 font-medium inline-flex items-center gap-1">
                        <GitBranch className="w-3.5 h-3.5" />
                        شرط منطقي ({q.skipLogic?.conditions.length})
                      </span>
                    )}
                  </div>

                  <input
                    type="text"
                    value={q.hint || ''}
                    onChange={(e) => {
                      const next = [...questions];
                      next[idx] = { ...q, hint: e.target.value };
                      updateQuestions(next);
                    }}
                    placeholder="تلميح السؤال (اختياري)..."
                    className="w-full text-xs text-slate-500 italic bg-transparent border-b border-transparent focus:border-slate-300 focus:outline-none py-0.5"
                  />

                  {/* Options editor for select_one / select_multiple / rank */}
                  {(q.type === 'select_one' ||
                    q.type === 'select_multiple' ||
                    q.type === 'rank') && (
                    <div className="pt-2 space-y-1.5">
                      {(q.options || []).map((opt, optIdx) => (
                        <div key={optIdx} className="flex items-center gap-2">
                          <span className="text-xs text-slate-400 w-4 text-center">
                            {q.type === 'select_one' ? '○' : q.type === 'rank' ? `${optIdx + 1}.` : '☐'}
                          </span>
                          <input
                            type="text"
                            value={opt.label}
                            onChange={(e) => {
                              const nextOpts = [...(q.options || [])];
                              nextOpts[optIdx] = { ...opt, label: e.target.value };
                              const next = [...questions];
                              next[idx] = { ...q, options: nextOpts };
                              updateQuestions(next);
                            }}
                            className="flex-1 text-xs text-slate-700 border border-slate-200 rounded px-2.5 py-1 focus:outline-none focus:border-sky-400"
                          />
                          <button
                            type="button"
                            onClick={() => {
                              const nextOpts = (q.options || []).filter((_, i) => i !== optIdx);
                              const next = [...questions];
                              next[idx] = { ...q, options: nextOpts };
                              updateQuestions(next);
                            }}
                            className="text-slate-400 hover:text-rose-600 p-1"
                            title="حذف الخيار"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      ))}
                      <button
                        type="button"
                        onClick={() => {
                          const nextOpts = [
                            ...(q.options || []),
                            {
                              value: `opt_${Date.now().toString(36).slice(-4)}`,
                              label: `خيار ${(q.options?.length || 0) + 1}`,
                            },
                          ];
                          const next = [...questions];
                          next[idx] = { ...q, options: nextOpts };
                          updateQuestions(next);
                        }}
                        className="text-xs text-sky-600 hover:text-sky-700 font-medium inline-flex items-center gap-1 pt-1"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        إضافة خيار
                      </button>
                    </div>
                  )}

                  {q.type === 'calculate' && (
                    <div className="pt-1 flex items-center gap-2">
                      <span className="text-xs text-slate-500">المعادلة الحسابية:</span>
                      <input
                        type="text"
                        dir="ltr"
                        value={q.formula || ''}
                        onChange={(e) => {
                          const next = [...questions];
                          next[idx] = { ...q, formula: e.target.value };
                          updateQuestions(next);
                        }}
                        className="flex-1 text-xs font-mono bg-slate-50 border border-slate-200 rounded px-2.5 py-1 text-slate-700"
                        placeholder="${estimated_order_boxes} * ${avg_box_price}"
                      />
                    </div>
                  )}

                  {q.type === 'range' && (
                    <div className="pt-1 flex flex-wrap items-center gap-3 text-xs text-slate-600">
                      <label className="flex items-center gap-1.5">
                        <span>من:</span>
                        <input
                          type="number"
                          value={q.rangeMin ?? 0}
                          onChange={(e) => {
                            const next = [...questions];
                            next[idx] = { ...q, rangeMin: Number(e.target.value) };
                            updateQuestions(next);
                          }}
                          className="w-16 border border-slate-200 rounded px-2 py-1 tabular-nums"
                        />
                      </label>
                      <label className="flex items-center gap-1.5">
                        <span>إلى:</span>
                        <input
                          type="number"
                          value={q.rangeMax ?? 10}
                          onChange={(e) => {
                            const next = [...questions];
                            next[idx] = { ...q, rangeMax: Number(e.target.value) };
                            updateQuestions(next);
                          }}
                          className="w-16 border border-slate-200 rounded px-2 py-1 tabular-nums"
                        />
                      </label>
                      <label className="flex items-center gap-1.5">
                        <span>الخطوة:</span>
                        <input
                          type="number"
                          value={q.rangeStep ?? 1}
                          onChange={(e) => {
                            const next = [...questions];
                            next[idx] = { ...q, rangeStep: Number(e.target.value) };
                            updateQuestions(next);
                          }}
                          className="w-16 border border-slate-200 rounded px-2 py-1 tabular-nums"
                        />
                      </label>
                    </div>
                  )}
                </div>

                {/* Action Icons Rail (matching Screenshot 3 right rail) */}
                <div className="w-11 border-r border-slate-200 bg-slate-50/40 flex flex-col items-center justify-center gap-1 py-2 shrink-0">
                  <button
                    type="button"
                    onClick={() => setEditingSettingsId(q.id)}
                    title="إعدادات السؤال والشروط المنطقية"
                    className="p-1.5 text-slate-600 hover:text-sky-600 hover:bg-sky-50 rounded transition-colors"
                  >
                    <SettingsIcon className="w-4 h-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDuplicate(idx)}
                    title="تكرار السؤال"
                    className="p-1.5 text-slate-600 hover:text-sky-600 hover:bg-sky-50 rounded transition-colors"
                  >
                    <Copy className="w-4 h-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => handleMove(idx, -1)}
                    disabled={idx === 0}
                    title="تحريك للأعلى"
                    className="p-1 text-slate-400 hover:text-slate-700 disabled:opacity-30"
                  >
                    <ArrowUp className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => handleMove(idx, 1)}
                    disabled={idx === questions.length - 1}
                    title="تحريك للأسفل"
                    className="p-1 text-slate-400 hover:text-slate-700 disabled:opacity-30"
                  >
                    <ArrowDown className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDelete(q.id)}
                    title="حذف السؤال"
                    className="p-1.5 text-slate-500 hover:text-rose-600 hover:bg-rose-50 rounded transition-colors"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {/* Inline Question Picker at this position */}
              {pickerIndex === idx + 1 && (
                <QuestionTypePickerPanel
                  draftLabel={newQuestionDraftLabel}
                  onChangeDraftLabel={setNewQuestionDraftLabel}
                  onSelectType={handleCreateQuestionOfType}
                  onClose={() => setPickerIndex(null)}
                />
              )}
            </React.Fragment>
          );
        })}

        {pickerIndex === 0 && questions.length === 0 && (
          <QuestionTypePickerPanel
            draftLabel={newQuestionDraftLabel}
            onChangeDraftLabel={setNewQuestionDraftLabel}
            onSelectType={handleCreateQuestionOfType}
            onClose={() => setPickerIndex(null)}
          />
        )}

        {/* Bottom Add Question Button */}
        {pickerIndex !== questions.length && (
          <div className="pt-2 flex items-center justify-center">
            <button
              type="button"
              onClick={() => handleOpenPickerAt(questions.length)}
              className="w-full py-3 border border-dashed border-sky-400 bg-sky-50/40 hover:bg-sky-50 text-sky-700 rounded-md text-sm font-medium inline-flex items-center justify-center gap-2 transition-colors"
            >
              <Plus className="w-4 h-4" />
              إضافة سؤال جديد (اختر من 26 نوع سؤال)
            </button>
          </div>
        )}

        {pickerIndex === questions.length && questions.length > 0 && (
          <QuestionTypePickerPanel
            draftLabel={newQuestionDraftLabel}
            onChangeDraftLabel={setNewQuestionDraftLabel}
            onSelectType={handleCreateQuestionOfType}
            onClose={() => setPickerIndex(null)}
          />
        )}
      </div>

      {/* Question Settings & Skip Logic Modal */}
      {settingsQuestion && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-lg max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between">
              <h3 className="text-base font-semibold text-slate-900">
                إعدادات السؤال والشروط المنطقية (Skip Logic)
              </h3>
              <button
                type="button"
                onClick={() => setEditingSettingsId(null)}
                className="text-slate-400 hover:text-slate-700 p-1"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-5 space-y-5">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    اسم المتغير البرمجي (XML Name)
                  </label>
                  <input
                    type="text"
                    dir="ltr"
                    value={settingsQuestion.name}
                    onChange={(e) => {
                      const next = questions.map((item) =>
                        item.id === settingsQuestion.id
                          ? { ...item, name: e.target.value.replace(/\s+/g, '_') }
                          : item
                      );
                      updateQuestions(next);
                    }}
                    className="w-full border border-slate-300 rounded-md px-3 py-2 text-xs font-mono"
                  />
                </div>
                <div className="flex items-end pb-2">
                  <label className="flex items-center gap-2 cursor-pointer text-sm text-slate-800 font-medium">
                    <input
                      type="checkbox"
                      checked={settingsQuestion.required}
                      onChange={(e) => {
                        const next = questions.map((item) =>
                          item.id === settingsQuestion.id
                            ? { ...item, required: e.target.checked }
                            : item
                        );
                        updateQuestions(next);
                      }}
                      className="w-4 h-4 rounded border-slate-300 text-sky-600"
                    />
                    إجابة إلزامية (Mandatory)
                  </label>
                </div>
              </div>

              {/* Skip Logic Builder */}
              <div className="border-t border-slate-200 pt-4 space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-sm font-semibold text-slate-900 flex items-center gap-1.5">
                      <GitBranch className="w-4 h-4 text-sky-600" />
                      الشروط المنطقية لإظهار السؤال
                    </div>
                    <p className="text-xs text-slate-500 mt-0.5">
                      يظهر هذا السؤال للمستخدم فقط عند تحقق الشروط المحددة من الأسئلة السابقة.
                    </p>
                  </div>
                  {previousQuestions.length > 0 && (
                    <button
                      type="button"
                      onClick={() => {
                        const firstPrev = previousQuestions[0];
                        const defaultVal = firstPrev.options?.[0]?.value ?? '';
                        const existingLogic = settingsQuestion.skipLogic || {
                          match: 'all' as const,
                          conditions: [],
                        };
                        const nextCond: SkipCondition = {
                          questionId: firstPrev.id,
                          operator: 'equals',
                          value: defaultVal,
                        };
                        const next = questions.map((item) =>
                          item.id === settingsQuestion.id
                            ? {
                                ...item,
                                skipLogic: {
                                  ...existingLogic,
                                  conditions: [...existingLogic.conditions, nextCond],
                                },
                              }
                            : item
                        );
                        updateQuestions(next);
                      }}
                      className="px-3 py-1.5 bg-sky-50 text-sky-700 hover:bg-sky-100 rounded-md text-xs font-medium inline-flex items-center gap-1"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      إضافة شرط
                    </button>
                  )}
                </div>

                {previousQuestions.length === 0 ? (
                  <div className="text-xs text-slate-500 bg-slate-50 p-3 rounded-md border border-slate-200">
                    لا توجد أسئلة سابقة لربط شروط منطقية بها (هذا هو السؤال الأول).
                  </div>
                ) : (settingsQuestion.skipLogic?.conditions.length ?? 0) === 0 ? (
                  <div className="text-xs text-slate-500 bg-slate-50 p-3 rounded-md border border-slate-200">
                    لا توجد شروط منطقية — سيظهر هذا السؤال دائماً للجميع.
                  </div>
                ) : (
                  <div className="space-y-2.5">
                    {settingsQuestion.skipLogic!.conditions.map((cond, cIdx) => {
                      const refQ = previousQuestions.find((pq) => pq.id === cond.questionId);
                      return (
                        <div
                          key={cIdx}
                          className="grid grid-cols-1 sm:grid-cols-12 gap-2 items-center bg-slate-50 p-2.5 rounded-md border border-slate-200"
                        >
                          <select
                            value={cond.questionId}
                            onChange={(e) => {
                              const nextConds = [...settingsQuestion.skipLogic!.conditions];
                              nextConds[cIdx] = { ...cond, questionId: e.target.value };
                              const next = questions.map((item) =>
                                item.id === settingsQuestion.id
                                  ? {
                                      ...item,
                                      skipLogic: { ...item.skipLogic!, conditions: nextConds },
                                    }
                                  : item
                              );
                              updateQuestions(next);
                            }}
                            className="sm:col-span-5 border border-slate-300 rounded px-2 py-1.5 text-xs bg-white"
                          >
                            {previousQuestions.map((pq) => (
                              <option key={pq.id} value={pq.id}>
                                {pq.label}
                              </option>
                            ))}
                          </select>

                          <select
                            value={cond.operator}
                            onChange={(e) => {
                              const nextConds = [...settingsQuestion.skipLogic!.conditions];
                              nextConds[cIdx] = {
                                ...cond,
                                operator: e.target.value as SkipOperator,
                              };
                              const next = questions.map((item) =>
                                item.id === settingsQuestion.id
                                  ? {
                                      ...item,
                                      skipLogic: { ...item.skipLogic!, conditions: nextConds },
                                    }
                                  : item
                              );
                              updateQuestions(next);
                            }}
                            className="sm:col-span-3 border border-slate-300 rounded px-2 py-1.5 text-xs bg-white"
                          >
                            {Object.entries(SKIP_OPERATOR_LABELS).map(([op, label]) => (
                              <option key={op} value={op}>
                                {label}
                              </option>
                            ))}
                          </select>

                          {cond.operator !== 'is_answered' ? (
                            refQ?.options && refQ.options.length > 0 ? (
                              <select
                                value={cond.value}
                                onChange={(e) => {
                                  const nextConds = [...settingsQuestion.skipLogic!.conditions];
                                  nextConds[cIdx] = { ...cond, value: e.target.value };
                                  const next = questions.map((item) =>
                                    item.id === settingsQuestion.id
                                      ? {
                                          ...item,
                                          skipLogic: { ...item.skipLogic!, conditions: nextConds },
                                        }
                                      : item
                                  );
                                  updateQuestions(next);
                                }}
                                className="sm:col-span-3 border border-slate-300 rounded px-2 py-1.5 text-xs bg-white"
                              >
                                {refQ.options.map((opt) => (
                                  <option key={opt.value} value={opt.value}>
                                    {opt.label}
                                  </option>
                                ))}
                              </select>
                            ) : (
                              <input
                                type="text"
                                value={cond.value}
                                onChange={(e) => {
                                  const nextConds = [...settingsQuestion.skipLogic!.conditions];
                                  nextConds[cIdx] = { ...cond, value: e.target.value };
                                  const next = questions.map((item) =>
                                    item.id === settingsQuestion.id
                                      ? {
                                          ...item,
                                          skipLogic: { ...item.skipLogic!, conditions: nextConds },
                                        }
                                      : item
                                  );
                                  updateQuestions(next);
                                }}
                                placeholder="القيمة"
                                className="sm:col-span-3 border border-slate-300 rounded px-2 py-1.5 text-xs bg-white"
                              />
                            )
                          ) : (
                            <div className="sm:col-span-3 text-xs text-slate-400 px-2">
                              أي إجابة
                            </div>
                          )}

                          <button
                            type="button"
                            onClick={() => {
                              const nextConds = settingsQuestion.skipLogic!.conditions.filter(
                                (_, i) => i !== cIdx
                              );
                              const next = questions.map((item) =>
                                item.id === settingsQuestion.id
                                  ? {
                                      ...item,
                                      skipLogic: { ...item.skipLogic!, conditions: nextConds },
                                    }
                                  : item
                              );
                              updateQuestions(next);
                            }}
                            className="sm:col-span-1 text-slate-400 hover:text-rose-600 flex justify-center"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>

            <div className="px-5 py-3.5 border-t border-slate-200 bg-slate-50 flex justify-end">
              <button
                type="button"
                onClick={() => setEditingSettingsId(null)}
                className="px-4 py-2 bg-sky-600 hover:bg-sky-700 text-white text-xs font-semibold rounded-md"
              >
                اعتماد الإعدادات
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add from Veterinary Library Modal */}
      {showLibraryModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-lg max-w-2xl w-full max-h-[85vh] overflow-y-auto">
            <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between">
              <div>
                <h3 className="text-base font-semibold text-slate-900">
                  مكتبة الأسئلة المعيارية للأدوية البيطرية
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  أدرج مجموعات أسئلة جاهزة ومجربة ميدانياً بضغطة واحدة.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowLibraryModal(false)}
                className="text-slate-400 hover:text-slate-700 p-1"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-5 divide-y divide-slate-200">
              {VETERINARY_LIBRARY_BLOCKS.map((block) => (
                <div
                  key={block.id}
                  className="py-4 first:pt-0 last:pb-0 flex items-start justify-between gap-4"
                >
                  <div>
                    <div className="text-sm font-semibold text-slate-900">{block.title}</div>
                    <div className="text-xs text-slate-500 mt-0.5">
                      {block.category} · {block.questions.length} أسئلة
                    </div>
                    <p className="text-xs text-slate-600 mt-1.5">{block.description}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleInsertLibraryBlock(block)}
                    className="px-3.5 py-2 bg-sky-600 hover:bg-sky-700 text-white text-xs font-medium rounded-md whitespace-nowrap shrink-0 inline-flex items-center gap-1"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    إدراج في النموذج
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

interface PickerPanelProps {
  draftLabel: string;
  onChangeDraftLabel: (val: string) => void;
  onSelectType: (type: QuestionType) => void;
  onClose: () => void;
}

const QuestionTypePickerPanel: React.FC<PickerPanelProps> = ({
  draftLabel,
  onChangeDraftLabel,
  onSelectType,
  onClose,
}) => {
  return (
    <div className="bg-white border-2 border-sky-500 rounded-md overflow-hidden shadow-sm">
      <div className="px-4 py-3 border-b border-sky-200 flex items-center gap-3 bg-sky-50/40">
        <input
          type="text"
          value={draftLabel}
          onChange={(e) => onChangeDraftLabel(e.target.value)}
          placeholder="اكتب نص السؤال الجديد ثم اختر نوع الإجابة من القائمة أدناه..."
          className="flex-1 text-sm font-semibold text-slate-900 bg-white border border-slate-300 rounded px-3 py-1.5 focus:outline-none focus:border-sky-500"
          autoFocus
        />
        <button
          type="button"
          onClick={onClose}
          className="text-slate-500 hover:text-slate-800 p-1"
          title="إغلاق"
        >
          <X className="w-5 h-5" />
        </button>
      </div>
      <div className="p-4 grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
        {QUESTION_TYPES.map((qt) => (
          <button
            key={qt.type}
            type="button"
            onClick={() => onSelectType(qt.type)}
            title={qt.descriptionAr}
            className="flex items-center gap-2.5 p-2.5 rounded border border-slate-200 hover:border-sky-500 hover:bg-sky-50/60 text-right transition-colors group"
          >
            <span className="w-9 h-7 rounded bg-slate-100 group-hover:bg-sky-100 text-slate-700 group-hover:text-sky-700 text-xs font-mono font-semibold flex items-center justify-center shrink-0">
              {qt.badge}
            </span>
            <div className="min-w-0">
              <div className="text-xs font-semibold text-slate-800 truncate">{qt.labelAr}</div>
              <div className="text-[10px] text-slate-400 truncate">{qt.labelEn}</div>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
};
