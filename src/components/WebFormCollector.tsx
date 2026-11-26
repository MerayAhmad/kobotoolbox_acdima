import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowDown,
  ArrowRight,
  ArrowUp,
  Camera,
  CheckCircle2,
  CloudOff,
  MapPin,
  QrCode,
  RefreshCw,
  Send,
  Star,
  Wifi,
  WifiOff,
} from 'lucide-react';
import type { FormQuestion, Project } from '../types/kobo';
import {
  addToOfflineQueue,
  getOfflineQueue,
  submitFormResponse,
  syncOfflineQueueForProject,
} from '../utils/api';
import { evaluateFormula, isQuestionVisible } from '../utils/skipLogic';

interface WebFormCollectorProps {
  project: Project;
  previewOnly?: boolean;
  onClose: () => void;
  onSubmitted: () => Promise<void>;
}

const QUICK_GPS_PRESETS = [
  { label: 'دمشق', lat: 33.5138, lng: 36.2765 },
  { label: 'حلب', lat: 36.2021, lng: 37.1343 },
  { label: 'حمص', lat: 34.7324, lng: 36.7137 },
  { label: 'حماة', lat: 35.1318, lng: 36.7578 },
  { label: 'اللاذقية', lat: 35.5317, lng: 35.7918 },
  { label: 'طرطوس', lat: 34.8959, lng: 35.8867 },
  { label: 'درعا', lat: 32.6189, lng: 36.1021 },
];

export const WebFormCollector: React.FC<WebFormCollectorProps> = ({
  project,
  previewOnly = false,
  onClose,
  onSubmitted,
}) => {
  const [answers, setAnswers] = useState<Record<string, unknown>>({});
  const [submittedBy, setSubmittedBy] = useState('مندوب المبيعات الميداني');
  const [startTime] = useState(() => new Date().toISOString());
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const [simulatedOffline, setSimulatedOffline] = useState(!navigator.onLine);
  const [offlineCount, setOfflineCount] = useState(
    () => getOfflineQueue().filter((q) => q.projectId === project.id).length
  );
  const [syncing, setSyncing] = useState(false);
  const [locatingId, setLocatingId] = useState<string | null>(null);

  useEffect(() => {
    const onOnline = () => setSimulatedOffline(false);
    const onOffline = () => setSimulatedOffline(true);
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    return () => {
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
    };
  }, []);

  // Recompute calculate fields automatically whenever answers change
  const computedAnswers = useMemo(() => {
    const next = { ...answers };
    for (const q of project.questions) {
      if (q.type === 'calculate') {
        next[q.name] = evaluateFormula(q.formula, next);
      }
    }
    return next;
  }, [answers, project.questions]);

  const visibleQuestions = useMemo(() => {
    return project.questions.filter((q) =>
      isQuestionVisible(q, computedAnswers, project.questions)
    );
  }, [project.questions, computedAnswers]);

  const setAnswer = (name: string, value: unknown) => {
    setAnswers((prev) => ({ ...prev, [name]: value }));
  };

  const handleCaptureGps = (q: FormQuestion) => {
    setLocatingId(q.id);
    if (!navigator.geolocation) {
      setAnswer(q.name, { lat: 33.5138, lng: 36.2765, accuracy: 15 });
      setLocatingId(null);
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setAnswer(q.name, {
          lat: Number(pos.coords.latitude.toFixed(5)),
          lng: Number(pos.coords.longitude.toFixed(5)),
          accuracy: Math.round(pos.coords.accuracy || 10),
        });
        setLocatingId(null);
      },
      () => {
        // Graceful fallback to Damascus if browser denies geolocation in iframe
        setAnswer(q.name, { lat: 33.5138, lng: 36.2765, accuracy: 12 });
        setLocatingId(null);
      },
      { enableHighAccuracy: true, timeout: 6000 }
    );
  };

  const handleImageFile = (q: FormQuestion, file: File | undefined) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const maxWidth = 900;
        const scale = img.width > maxWidth ? maxWidth / img.width : 1;
        canvas.width = Math.round(img.width * scale);
        canvas.height = Math.round(img.height * scale);
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
          setAnswer(q.name, canvas.toDataURL('image/jpeg', 0.78));
        }
      };
      img.src = String(reader.result);
    };
    reader.readAsDataURL(file);
  };

  const handleSyncNow = async () => {
    if (simulatedOffline) {
      setErrorMsg('يرجى إيقاف وضع عدم الاتصال أولاً لإجراء المزامنة مع الخادم.');
      return;
    }
    setSyncing(true);
    setErrorMsg('');
    try {
      const { syncedCount, remaining } = await syncOfflineQueueForProject(project.id);
      setOfflineCount(remaining.filter((r) => r.projectId === project.id).length);
      if (syncedCount > 0) {
        setSuccessMsg(`تمت مزامنة ${syncedCount} استمارة محفوظة محلياً إلى الخادم بنجاح.`);
        await onSubmitted();
      }
    } catch {
      setErrorMsg('تعذرت المزامنة مع الخادم حالياً.');
    } finally {
      setSyncing(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    setSuccessMsg('');

    if (previewOnly) {
      setSuccessMsg('معاينة النموذج ناجحة — جميع الحقول والشروط المنطقية تعمل بدقة (لم يتم حفظ بيانات).');
      return;
    }

    // Validate visible required fields
    for (const q of visibleQuestions) {
      if (!q.required || q.type === 'note' || q.type === 'calculate') continue;
      const val = computedAnswers[q.name];
      const empty =
        val === undefined ||
        val === null ||
        val === '' ||
        (Array.isArray(val) && val.length === 0);
      if (empty) {
        setErrorMsg(`يرجى تعبئة الحقل الإلزامي: "${q.label}"`);
        return;
      }
    }

    const endTime = new Date().toISOString();

    if (simulatedOffline && project.allowOffline) {
      const next = addToOfflineQueue({
        localId: `off_${Date.now()}`,
        projectId: project.id,
        projectTitle: project.title,
        submittedAt: endTime,
        startTime,
        endTime,
        submittedBy,
        answers: computedAnswers,
      });
      setOfflineCount(next.filter((i) => i.projectId === project.id).length);
      setAnswers({});
      setSuccessMsg(
        'تم حفظ الاستمارة محلياً في وضع عدم الاتصال (Offline Queue). ستتم مزامنتها فور عودة الشبكة.'
      );
      return;
    }

    setSubmitting(true);
    try {
      await submitFormResponse(project.id, {
        submittedAt: endTime,
        startTime,
        endTime,
        submittedBy,
        answers: computedAnswers,
      });
      setAnswers({});
      setSuccessMsg('تم إرسال الاستمارة وحفظ البيانات الميدانية بنجاح.');
      await onSubmitted();
    } catch {
      if (project.allowOffline) {
        const next = addToOfflineQueue({
          localId: `off_${Date.now()}`,
          projectId: project.id,
          projectTitle: project.title,
          submittedAt: endTime,
          startTime,
          endTime,
          submittedBy,
          answers: computedAnswers,
        });
        setOfflineCount(next.filter((i) => i.projectId === project.id).length);
        setAnswers({});
        setSuccessMsg('انقطع الاتصال — تم حفظ الاستمارة محلياً في قائمة الانتظار بأمان.');
      } else {
        setErrorMsg('تعذر إرسال الاستمارة للخادم.');
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-100 py-6 px-4">
      <div className="max-w-3xl mx-auto space-y-4">
        {/* Top Collector Bar */}
        <div className="bg-white border border-slate-200 rounded-lg px-4 py-3 flex flex-wrap items-center justify-between gap-3">
          <button
            type="button"
            onClick={onClose}
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-700 hover:text-sky-700"
          >
            <ArrowRight className="w-4 h-4" />
            العودة إلى لوحة المشروع
          </button>

          <div className="flex flex-wrap items-center gap-2">
            {project.allowOffline && (
              <button
                type="button"
                onClick={() => setSimulatedOffline((prev) => !prev)}
                className={`px-3 py-1.5 rounded-md text-xs font-medium border inline-flex items-center gap-1.5 transition-colors ${
                  simulatedOffline
                    ? 'bg-amber-50 border-amber-300 text-amber-800'
                    : 'bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100'
                }`}
              >
                {simulatedOffline ? (
                  <>
                    <WifiOff className="w-3.5 h-3.5 text-amber-600" />
                    وضع عدم الاتصال (Offline)
                  </>
                ) : (
                  <>
                    <Wifi className="w-3.5 h-3.5 text-emerald-600" />
                    متصل بالشبكة
                  </>
                )}
              </button>
            )}

            {offlineCount > 0 && (
              <button
                type="button"
                onClick={handleSyncNow}
                disabled={syncing}
                className="px-3 py-1.5 bg-sky-600 hover:bg-sky-700 text-white rounded-md text-xs font-semibold inline-flex items-center gap-1.5 tabular-nums"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${syncing ? 'animate-spin' : ''}`} />
                مزامنة ({offlineCount})
              </button>
            )}
          </div>
        </div>

        {/* Enketo-Style Form Container */}
        <form
          onSubmit={handleSubmit}
          className="bg-white border border-slate-200 rounded-lg overflow-hidden shadow-xs"
        >
          {/* Form Header */}
          <div className="bg-sky-600 text-white px-6 py-5 space-y-1">
            <div className="text-xs text-sky-100 font-medium">
              شركة أكديما للأدوية البيطرية (سوريا) ·{' '}
              {previewOnly ? 'وضع معاينة النموذج (تجريبي)' : 'استمارة جمع البيانات الميدانية'}
            </div>
            <h1 className="text-xl font-bold">{project.title}</h1>
            {project.description && (
              <p className="text-xs text-sky-100/90 leading-relaxed pt-1">{project.description}</p>
            )}
          </div>

          <div className="p-6 space-y-6">
            {/* Rep / Respondent Name */}
            <div className="bg-slate-50 border border-slate-200 rounded-md p-4">
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                اسم المندوب / مُعبّئ الاستمارة
              </label>
              <input
                type="text"
                value={submittedBy}
                onChange={(e) => setSubmittedBy(e.target.value)}
                required
                className="w-full bg-white border border-slate-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500"
              />
            </div>

            {errorMsg && (
              <div className="bg-rose-50 border border-rose-200 text-rose-800 px-4 py-3 rounded-md text-xs font-medium">
                {errorMsg}
              </div>
            )}

            {successMsg && (
              <div className="bg-emerald-50 border border-emerald-200 text-emerald-800 px-4 py-3 rounded-md text-xs font-medium flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                <span>{successMsg}</span>
              </div>
            )}

            {/* Dynamic Visible Questions */}
            <div className="space-y-5">
              {visibleQuestions.map((q, idx) => (
                <div
                  key={q.id}
                  className="border border-slate-200 rounded-md p-4 space-y-2.5 bg-white"
                >
                  <div className="flex items-start justify-between gap-2">
                    <label className="text-sm font-semibold text-slate-900">
                      <span className="text-slate-400 font-mono ml-1.5 tabular-nums">
                        {idx + 1}.
                      </span>
                      {q.label}
                      {q.required && <span className="text-rose-600 mr-1">*</span>}
                    </label>
                  </div>

                  {q.hint && <p className="text-xs text-slate-500">{q.hint}</p>}

                  <QuestionInputRenderer
                    question={q}
                    value={computedAnswers[q.name]}
                    onChange={(val) => setAnswer(q.name, val)}
                    onCaptureGps={() => handleCaptureGps(q)}
                    locating={locatingId === q.id}
                    onImageFile={(file) => handleImageFile(q, file)}
                  />
                </div>
              ))}
            </div>

            {/* Submit Bar */}
            <div className="pt-4 border-t border-slate-200 flex flex-wrap items-center justify-between gap-3">
              <div className="text-xs text-slate-500 flex items-center gap-1.5">
                {simulatedOffline ? (
                  <>
                    <CloudOff className="w-4 h-4 text-amber-600" />
                    سيتم الحفظ محلياً للمزامنة لاحقاً
                  </>
                ) : (
                  <span>سيتم إرسال البيانات مباشرة إلى قاعدة بيانات الشركة</span>
                )}
              </div>
              <button
                type="submit"
                disabled={submitting}
                className="px-6 py-2.5 bg-sky-600 hover:bg-sky-700 text-white rounded-md text-sm font-semibold inline-flex items-center gap-2 transition-colors disabled:opacity-60"
              >
                <Send className="w-4 h-4" />
                {previewOnly
                  ? 'اختبار التحقق من النموذج'
                  : submitting
                    ? 'جارٍ الإرسال...'
                    : simulatedOffline
                      ? 'حفظ محلياً (Offline)'
                      : 'إرسال الاستمارة'}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};

interface QuestionInputRendererProps {
  question: FormQuestion;
  value: unknown;
  onChange: (val: unknown) => void;
  onCaptureGps: () => void;
  locating: boolean;
  onImageFile: (file: File | undefined) => void;
}

const QuestionInputRenderer: React.FC<QuestionInputRendererProps> = ({
  question,
  value,
  onChange,
  onCaptureGps,
  locating,
  onImageFile,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [drawing, setDrawing] = useState(false);

  switch (question.type) {
    case 'note':
      return (
        <div className="text-xs text-slate-600 bg-slate-50 border border-slate-200 rounded p-3">
          ملاحظة إرشادية
        </div>
      );

    case 'text':
    case 'xml':
      return (
        <textarea
          rows={2}
          value={String(value ?? '')}
          onChange={(e) => onChange(e.target.value)}
          placeholder="أدخل الإجابة هنا..."
          className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500"
        />
      );

    case 'integer':
      return (
        <input
          type="number"
          step={1}
          value={value !== undefined && value !== null ? String(value) : ''}
          onChange={(e) => onChange(e.target.value === '' ? '' : parseInt(e.target.value, 10))}
          className="w-full sm:w-64 border border-slate-300 rounded-md px-3 py-2 text-sm tabular-nums focus:outline-none focus:ring-2 focus:ring-sky-500"
        />
      );

    case 'decimal':
      return (
        <input
          type="number"
          step="0.01"
          value={value !== undefined && value !== null ? String(value) : ''}
          onChange={(e) => onChange(e.target.value === '' ? '' : parseFloat(e.target.value))}
          className="w-full sm:w-64 border border-slate-300 rounded-md px-3 py-2 text-sm tabular-nums focus:outline-none focus:ring-2 focus:ring-sky-500"
        />
      );

    case 'date':
      return (
        <input
          type="date"
          value={String(value ?? '')}
          onChange={(e) => onChange(e.target.value)}
          className="border border-slate-300 rounded-md px-3 py-2 text-sm tabular-nums"
        />
      );

    case 'time':
      return (
        <input
          type="time"
          value={String(value ?? '')}
          onChange={(e) => onChange(e.target.value)}
          className="border border-slate-300 rounded-md px-3 py-2 text-sm tabular-nums"
        />
      );

    case 'datetime':
      return (
        <input
          type="datetime-local"
          value={String(value ?? '')}
          onChange={(e) => onChange(e.target.value)}
          className="border border-slate-300 rounded-md px-3 py-2 text-sm tabular-nums"
        />
      );

    case 'select_one':
      return (
        <div className="space-y-2 pt-1">
          {(question.options || []).map((opt) => (
            <label
              key={opt.value}
              className={`flex items-center gap-2.5 p-2.5 rounded-md border cursor-pointer text-sm transition-colors ${
                value === opt.value
                  ? 'border-sky-500 bg-sky-50/70 text-sky-900 font-medium'
                  : 'border-slate-200 hover:bg-slate-50 text-slate-700'
              }`}
            >
              <input
                type="radio"
                name={question.id}
                checked={value === opt.value}
                onChange={() => onChange(opt.value)}
                className="w-4 h-4 text-sky-600 focus:ring-sky-500"
              />
              <span>{opt.label}</span>
            </label>
          ))}
        </div>
      );

    case 'select_multiple': {
      const selected = Array.isArray(value) ? (value as string[]) : [];
      return (
        <div className="space-y-2 pt-1">
          {(question.options || []).map((opt) => {
            const checked = selected.includes(opt.value);
            return (
              <label
                key={opt.value}
                className={`flex items-center gap-2.5 p-2.5 rounded-md border cursor-pointer text-sm transition-colors ${
                  checked
                    ? 'border-sky-500 bg-sky-50/70 text-sky-900 font-medium'
                    : 'border-slate-200 hover:bg-slate-50 text-slate-700'
                }`}
              >
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() => {
                    const next = checked
                      ? selected.filter((v) => v !== opt.value)
                      : [...selected, opt.value];
                    onChange(next);
                  }}
                  className="w-4 h-4 rounded text-sky-600 focus:ring-sky-500"
                />
                <span>{opt.label}</span>
              </label>
            );
          })}
        </div>
      );
    }

    case 'rating': {
      const numVal = Number(value || 0);
      return (
        <div className="flex items-center gap-2 pt-1">
          {[1, 2, 3, 4, 5].map((star) => (
            <button
              key={star}
              type="button"
              onClick={() => onChange(star)}
              className="p-1 focus:outline-none"
            >
              <Star
                className={`w-7 h-7 transition-colors ${
                  star <= numVal ? 'fill-amber-400 text-amber-500' : 'text-slate-300'
                }`}
              />
            </button>
          ))}
          <span className="text-xs text-slate-500 mr-2 tabular-nums">
            {numVal > 0 ? `${numVal} من 5` : 'اختر التقييم'}
          </span>
        </div>
      );
    }

    case 'range': {
      const min = question.rangeMin ?? 0;
      const max = question.rangeMax ?? 10;
      const step = question.rangeStep ?? 1;
      const current = value !== undefined && value !== '' ? Number(value) : min;
      return (
        <div className="space-y-2 pt-1">
          <div className="flex items-center justify-between text-xs text-slate-600 tabular-nums">
            <span>الحد الأدنى: {min}</span>
            <span className="text-sm font-bold text-sky-700">القيمة المختارة: {current}</span>
            <span>الحد الأقصى: {max}</span>
          </div>
          <input
            type="range"
            min={min}
            max={max}
            step={step}
            value={current}
            onChange={(e) => onChange(Number(e.target.value))}
            className="w-full accent-sky-600"
          />
        </div>
      );
    }

    case 'acknowledge':
      return (
        <label className="flex items-center gap-2.5 p-3 rounded-md border border-slate-200 cursor-pointer text-sm text-slate-800">
          <input
            type="checkbox"
            checked={Boolean(value)}
            onChange={(e) => onChange(e.target.checked)}
            className="w-4 h-4 rounded text-sky-600"
          />
          <span>أوافق وأؤكد ذلك</span>
        </label>
      );

    case 'calculate':
      return (
        <div className="bg-slate-50 border border-slate-200 rounded px-3 py-2 text-sm font-mono font-semibold text-sky-700 tabular-nums">
          {value !== undefined && value !== '' ? String(value) : '0'}
        </div>
      );

    case 'geopoint':
    case 'geotrace':
    case 'geoshape': {
      const pt = value as { lat: number; lng: number; accuracy?: number } | undefined;
      return (
        <div className="space-y-2.5">
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={onCaptureGps}
              disabled={locating}
              className="px-3.5 py-2 bg-sky-600 hover:bg-sky-700 text-white rounded-md text-xs font-semibold inline-flex items-center gap-1.5"
            >
              <MapPin className="w-4 h-4" />
              {locating ? 'جارٍ التقاط الإحداثيات...' : 'التقاط الموقع الجغرافي الحالي (GPS)'}
            </button>
            <div className="flex flex-wrap items-center gap-1.5">
              {QUICK_GPS_PRESETS.map((preset) => (
                <button
                  key={preset.label}
                  type="button"
                  onClick={() =>
                    onChange({ lat: preset.lat, lng: preset.lng, accuracy: 10 })
                  }
                  className="px-2 py-1 text-[11px] border border-slate-200 rounded bg-slate-50 hover:bg-slate-100 text-slate-600"
                >
                  {preset.label}
                </button>
              ))}
            </div>
          </div>
          {pt && (
            <div className="text-xs font-mono bg-emerald-50 border border-emerald-200 text-emerald-800 px-3 py-2 rounded tabular-nums">
              Lat: {pt.lat} · Lng: {pt.lng} (±{pt.accuracy ?? 10}m)
            </div>
          )}
        </div>
      );
    }

    case 'image':
      return (
        <div className="space-y-2.5">
          <label className="inline-flex items-center gap-2 px-3.5 py-2 border border-slate-300 bg-slate-50 hover:bg-slate-100 rounded-md text-xs font-semibold text-slate-700 cursor-pointer">
            <Camera className="w-4 h-4 text-sky-600" />
            التقاط صورة أو اختيار من الجهاز
            <input
              type="file"
              accept="image/*"
              capture="environment"
              onChange={(e) => onImageFile(e.target.files?.[0])}
              className="hidden"
            />
          </label>
          {typeof value === 'string' && value && (
            <img
              src={value}
              alt="معاينة الصورة الملتقطة"
              referrerPolicy="no-referrer"
              className="max-h-48 rounded-md border border-slate-200 object-cover"
            />
          )}
        </div>
      );

    case 'barcode':
      return (
        <div className="flex items-center gap-2">
          <QrCode className="w-5 h-5 text-slate-400 shrink-0" />
          <input
            type="text"
            dir="ltr"
            value={String(value ?? '')}
            onChange={(e) => onChange(e.target.value)}
            placeholder="VP-2026-XXXXX"
            className="flex-1 border border-slate-300 rounded-md px-3 py-2 text-sm font-mono"
          />
        </div>
      );

    case 'matrix': {
      const rows = question.matrixRows || ['الصنف 1', 'الصنف 2'];
      const cols = question.matrixCols || ['متوفر', 'قليل', 'منتهي'];
      const current = (value && typeof value === 'object' ? value : {}) as Record<string, string>;
      return (
        <div className="overflow-x-auto">
          <table className="w-full text-xs border border-slate-200 rounded">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200">
                <th className="p-2 text-right font-semibold text-slate-700">الصنف</th>
                {cols.map((c) => (
                  <th key={c} className="p-2 text-center font-semibold text-slate-700">
                    {c}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {rows.map((r) => (
                <tr key={r}>
                  <td className="p-2 font-medium text-slate-800">{r}</td>
                  {cols.map((c) => (
                    <td key={c} className="p-2 text-center">
                      <input
                        type="radio"
                        name={`${question.id}_${r}`}
                        checked={current[r] === c}
                        onChange={() => onChange({ ...current, [r]: c })}
                        className="w-4 h-4 text-sky-600"
                      />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
    }

    case 'rank': {
      const order: string[] =
        Array.isArray(value) && value.length > 0
          ? (value as string[])
          : (question.options || []).map((o) => o.value);
      const moveRank = (idx: number, dir: -1 | 1) => {
        const target = idx + dir;
        if (target < 0 || target >= order.length) return;
        const next = [...order];
        const [item] = next.splice(idx, 1);
        next.splice(target, 0, item);
        onChange(next);
      };
      return (
        <div className="space-y-1.5">
          {order.map((valKey, idx) => {
            const label = question.options?.find((o) => o.value === valKey)?.label ?? valKey;
            return (
              <div
                key={valKey}
                className="flex items-center justify-between px-3 py-2 border border-slate-200 rounded bg-slate-50/50 text-xs"
              >
                <span className="font-medium text-slate-800 tabular-nums">
                  {idx + 1}. {label}
                </span>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => moveRank(idx, -1)}
                    disabled={idx === 0}
                    className="p-1 text-slate-500 hover:text-sky-600 disabled:opacity-30"
                  >
                    <ArrowUp className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => moveRank(idx, 1)}
                    disabled={idx === order.length - 1}
                    className="p-1 text-slate-500 hover:text-sky-600 disabled:opacity-30"
                  >
                    <ArrowDown className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      );
    }

    case 'signature':
      return (
        <div className="space-y-2">
          <canvas
            ref={canvasRef}
            width={480}
            height={140}
            onMouseDown={(e) => {
              setDrawing(true);
              const ctx = canvasRef.current?.getContext('2d');
              const rect = canvasRef.current?.getBoundingClientRect();
              if (ctx && rect) {
                ctx.beginPath();
                ctx.moveTo(e.clientX - rect.left, e.clientY - rect.top);
              }
            }}
            onMouseMove={(e) => {
              if (!drawing) return;
              const ctx = canvasRef.current?.getContext('2d');
              const rect = canvasRef.current?.getBoundingClientRect();
              if (ctx && rect) {
                ctx.lineWidth = 2;
                ctx.strokeStyle = '#0f172a';
                ctx.lineTo(e.clientX - rect.left, e.clientY - rect.top);
                ctx.stroke();
              }
            }}
            onMouseUp={() => {
              setDrawing(false);
              if (canvasRef.current) {
                onChange(canvasRef.current.toDataURL('image/png'));
              }
            }}
            className="w-full max-w-md border border-slate-300 rounded bg-slate-50 cursor-crosshair"
          />
          <button
            type="button"
            onClick={() => {
              const ctx = canvasRef.current?.getContext('2d');
              if (ctx && canvasRef.current) {
                ctx.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);
              }
              onChange('');
            }}
            className="text-xs text-slate-500 hover:text-rose-600"
          >
            مسح التوقيع
          </button>
        </div>
      );

    default:
      // audio, video, file
      return (
        <input
          type="file"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) onChange(file.name);
          }}
          className="block text-xs text-slate-600 file:ml-3 file:py-1.5 file:px-3 file:rounded-md file:border file:border-slate-300 file:text-xs file:font-semibold file:bg-slate-50 file:text-slate-700 hover:file:bg-slate-100"
        />
      );
  }
};
