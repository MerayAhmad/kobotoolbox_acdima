import React, { useMemo, useState } from 'react';
import {
  BarChart3,
  Check,
  Copy,
  Download,
  Edit2,
  Eye,
  FileSpreadsheet,
  FileText,
  Image as ImageIcon,
  MapPin,
  Printer,
  Search,
  Table as TableIcon,
  Trash2,
  X,
  ZoomIn,
  ZoomOut,
  RotateCcw,
} from 'lucide-react';
import type { FormQuestion, FormSubmission, Project, ValidationStatus } from '../types/kobo';
import {
  exportProjectToCsv,
  exportProjectToExcel,
  exportProjectToJson,
  formatCellDisplay,
} from '../utils/api';
import { formatArabicDateTime, VALIDATION_STATUS_LABELS } from '../utils/skipLogic';

export type DataSubTab = 'reports' | 'table' | 'gallery' | 'downloads' | 'map';

interface DataTabProps {
  project: Project;
  submissions: FormSubmission[];
  activeSubTab: DataSubTab;
  onChangeSubTab: (tab: DataSubTab) => void;
  onUpdateSubmission: (subId: string, payload: Partial<FormSubmission>) => Promise<void>;
  onBulkAction: (
    ids: string[],
    action: 'validate' | 'delete',
    status?: ValidationStatus
  ) => Promise<void>;
}

const REGION_CITIES = [
  { name: 'دمشق', lat: 33.5138, lng: 36.2765 },
  { name: 'ريف دمشق', lat: 33.5722, lng: 36.45 },
  { name: 'حلب', lat: 36.2021, lng: 37.1343 },
  { name: 'حمص', lat: 34.7324, lng: 36.7137 },
  { name: 'حماة', lat: 35.1318, lng: 36.7578 },
  { name: 'اللاذقية', lat: 35.5317, lng: 35.7918 },
  { name: 'طرطوس', lat: 34.8959, lng: 35.8867 },
  { name: 'درعا', lat: 32.6189, lng: 36.1021 },
  { name: 'السويداء', lat: 32.709, lng: 36.5662 },
  { name: 'دير الزور', lat: 35.3359, lng: 40.1408 },
  { name: 'الحسكة', lat: 36.5054, lng: 40.7429 },
];

export const DataTab: React.FC<DataTabProps> = ({
  project,
  submissions,
  activeSubTab,
  onChangeSubTab,
  onUpdateSubmission,
  onBulkAction,
}) => {
  // Table state
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | ValidationStatus>('all');
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [viewingSub, setViewingSub] = useState<FormSubmission | null>(null);
  const [editingSub, setEditingSub] = useState<FormSubmission | null>(null);
  const [editDraftAnswers, setEditDraftAnswers] = useState<Record<string, unknown>>({});

  // Gallery state
  const [lightboxPhoto, setLightboxPhoto] = useState<{
    url: string;
    caption: string;
    sub: FormSubmission;
  } | null>(null);

  // Downloads copy state
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  // Map state
  const [mapZoom, setMapZoom] = useState(1);
  const [mapStatusFilter, setMapStatusFilter] = useState<'all' | ValidationStatus>('all');
  const [selectedMapSubId, setSelectedMapSubId] = useState<string | null>(null);

  const dataQuestions = useMemo(
    () => project.questions.filter((q) => q.type !== 'note' && q.type !== 'hidden'),
    [project.questions]
  );

  const filteredSubmissions = useMemo(() => {
    return submissions.filter((s) => {
      if (statusFilter !== 'all' && s.validationStatus !== statusFilter) return false;
      if (!searchQuery.trim()) return true;
      const needle = searchQuery.toLowerCase();
      if (s.submittedBy.toLowerCase().includes(needle)) return true;
      return Object.values(s.answers).some((val) =>
        String(val ?? '')
          .toLowerCase()
          .includes(needle)
      );
    });
  }, [submissions, statusFilter, searchQuery]);

  const toggleSelectAll = () => {
    if (selectedIds.length === filteredSubmissions.length) {
      setSelectedIds([]);
    } else {
      setSelectedIds(filteredSubmissions.map((s) => s.id));
    }
  };

  const toggleRow = (id: string) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  const handleOpenEdit = (sub: FormSubmission) => {
    setEditingSub(sub);
    setEditDraftAnswers({ ...sub.answers });
  };

  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingSub) return;
    await onUpdateSubmission(editingSub.id, { answers: editDraftAnswers });
    setEditingSub(null);
  };

  const copyText = (key: string, text: string) => {
    navigator.clipboard.writeText(text).catch(() => {});
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2000);
  };

  const galleryItems = useMemo(() => {
    const items: { url: string; caption: string; sub: FormSubmission }[] = [];
    for (const sub of submissions) {
      if (sub.photos && sub.photos.length > 0) {
        for (const p of sub.photos) {
          items.push({
            url: p.url,
            caption: p.caption || String(sub.answers.client_name || sub.submittedBy),
            sub,
          });
        }
      } else {
        for (const q of project.questions) {
          if (q.type === 'image' && typeof sub.answers[q.name] === 'string' && sub.answers[q.name]) {
            items.push({
              url: String(sub.answers[q.name]),
              caption: String(sub.answers.client_name || q.label),
              sub,
            });
          }
        }
      }
    }
    return items;
  }, [submissions, project.questions]);

  const geoSubmissions = useMemo(() => {
    return submissions.filter((s) => {
      if (!s.geoPoint || typeof s.geoPoint.lat !== 'number' || typeof s.geoPoint.lng !== 'number') {
        return false;
      }
      if (mapStatusFilter !== 'all' && s.validationStatus !== mapStatusFilter) return false;
      return true;
    });
  }, [submissions, mapStatusFilter]);

  const selectedMapSub =
    geoSubmissions.find((s) => s.id === selectedMapSubId) || geoSubmissions[0] || null;

  // Map coordinate projection (Syria bounds: Lat 32.1..37.5, Lng 35.4..42.6)
  const projectCoord = (lat: number, lng: number) => {
    const minLat = 32.1;
    const maxLat = 37.5;
    const minLng = 35.4;
    const maxLng = 42.6;
    const x = ((lng - minLng) / (maxLng - minLng)) * 760 + 40;
    const y = ((maxLat - lat) / (maxLat - minLat)) * 420 + 30;
    return {
      x: Math.max(25, Math.min(815, x)),
      y: Math.max(25, Math.min(455, y)),
    };
  };

  const apiJsonUrl = `${window.location.origin}/api/projects/${project.id}/export/json`;
  const apiCsvUrl = `${window.location.origin}/api/projects/${project.id}/export/csv`;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
      {/* Side Submenu (Screenshot 2 style: Reports, Table, Gallery, Downloads, Map) */}
      <aside className="lg:col-span-2 bg-white border border-slate-200 rounded-lg overflow-hidden no-print">
        <nav className="divide-y divide-slate-100">
          {[
            { id: 'reports' as const, label: 'التقارير', icon: BarChart3 },
            { id: 'table' as const, label: 'الجدول', icon: TableIcon },
            { id: 'gallery' as const, label: 'معرض الصور', icon: ImageIcon },
            { id: 'downloads' as const, label: 'التنزيلات', icon: Download },
            { id: 'map' as const, label: 'الخريطة', icon: MapPin },
          ].map((item) => {
            const Icon = item.icon;
            const active = activeSubTab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => onChangeSubTab(item.id)}
                className={`w-full px-4 py-3 flex items-center gap-2.5 text-sm font-medium transition-colors whitespace-nowrap ${
                  active
                    ? 'bg-sky-50 text-sky-700 font-semibold'
                    : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                }`}
              >
                <Icon className={`w-4 h-4 shrink-0 ${active ? 'text-sky-600' : 'text-slate-400'}`} />
                <span>{item.label}</span>
              </button>
            );
          })}
        </nav>
      </aside>

      {/* Main Content Area */}
      <div className="lg:col-span-10 space-y-5 min-w-0">
        {/* 1. REPORTS SUB-TAB */}
        {activeSubTab === 'reports' && (
          <div className="space-y-5">
            <div className="bg-white border border-slate-200 rounded-lg p-5 flex flex-wrap items-center justify-between gap-4">
              <div>
                <div className="text-xs font-semibold text-sky-700 mb-0.5">
                  شركة أكديما لإنتاج وتوزيع الأدوية البيطرية — الجمهورية العربية السورية
                </div>
                <h2 className="text-base font-bold text-slate-900">
                  التقرير التحليلي الرسمي: {project.title}
                </h2>
                <p className="text-xs text-slate-500 mt-1 tabular-nums">
                  تاريخ التوليد: {formatArabicDateTime(new Date().toISOString())} · إجمالي السجلات
                  المشمولة: {submissions.length}
                </p>
              </div>
              <div className="flex items-center gap-2 no-print">
                <button
                  type="button"
                  onClick={() => exportProjectToExcel(project, submissions)}
                  className="px-3.5 py-2 border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 rounded-md text-xs font-medium inline-flex items-center gap-1.5 whitespace-nowrap"
                >
                  <FileSpreadsheet className="w-4 h-4 text-emerald-600" />
                  تصدير Excel
                </button>
                <button
                  type="button"
                  onClick={() => window.print()}
                  className="px-3.5 py-2 bg-sky-600 hover:bg-sky-700 text-white rounded-md text-xs font-medium inline-flex items-center gap-1.5 whitespace-nowrap"
                >
                  <Printer className="w-4 h-4" />
                  طباعة التقرير
                </button>
              </div>
            </div>

            {/* 4 Executive Summary Metrics */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <div className="bg-white border border-slate-200 rounded-lg p-4">
                <div className="text-xs text-slate-500">إجمالي الاستجابات</div>
                <div className="text-2xl font-bold text-slate-900 mt-1 tabular-nums">
                  {submissions.length}
                </div>
              </div>
              <div className="bg-white border border-slate-200 rounded-lg p-4">
                <div className="text-xs text-slate-500">البيانات المعتمدة</div>
                <div className="text-2xl font-bold text-emerald-600 mt-1 tabular-nums">
                  {submissions.filter((s) => s.validationStatus === 'approved').length}
                </div>
              </div>
              <div className="bg-white border border-slate-200 rounded-lg p-4">
                <div className="text-xs text-slate-500">قيد المراجعة والتدقيق</div>
                <div className="text-2xl font-bold text-amber-600 mt-1 tabular-nums">
                  {submissions.filter((s) => s.validationStatus === 'pending').length}
                </div>
              </div>
              <div className="bg-white border border-slate-200 rounded-lg p-4">
                <div className="text-xs text-slate-500">مغطاة جغرافياً (GPS)</div>
                <div className="text-2xl font-bold text-sky-600 mt-1 tabular-nums">
                  {submissions.filter((s) => Boolean(s.geoPoint)).length}
                </div>
              </div>
            </div>

            {/* Automated Question-by-Question Statistical Breakdown */}
            {submissions.length === 0 ? (
              <div className="bg-white border border-slate-200 rounded-lg p-10 text-center text-sm text-slate-500">
                لا توجد استجابات مسجلة بعد لعرض التقارير الإحصائية.
              </div>
            ) : (
              <div className="space-y-4">
                {dataQuestions.map((q, qIdx) => (
                  <QuestionReportCard
                    key={q.id}
                    index={qIdx + 1}
                    question={q}
                    submissions={submissions}
                  />
                ))}
              </div>
            )}
          </div>
        )}

        {/* 2. TABLE SUB-TAB (Matching Screenshot 2) */}
        {activeSubTab === 'table' && (
          <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
            {/* Table Header Controls */}
            <div className="px-4 py-3 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <span className="text-xs font-medium text-slate-600 tabular-nums">
                  {filteredSubmissions.length > 0
                    ? `1 - ${filteredSubmissions.length} من ${filteredSubmissions.length} نتيجة`
                    : '0 نتائج'}
                </span>

                {selectedIds.length > 0 && (
                  <div className="flex items-center gap-1.5 bg-sky-50 border border-sky-200 rounded-md px-2.5 py-1">
                    <span className="text-xs font-semibold text-sky-800 tabular-nums">
                      تم تحديد {selectedIds.length}
                    </span>
                    <button
                      type="button"
                      onClick={async () => {
                        await onBulkAction(selectedIds, 'validate', 'approved');
                        setSelectedIds([]);
                      }}
                      className="text-xs text-emerald-700 hover:underline px-1.5 font-medium"
                    >
                      اعتماد
                    </button>
                    <button
                      type="button"
                      onClick={async () => {
                        await onBulkAction(selectedIds, 'validate', 'rejected');
                        setSelectedIds([]);
                      }}
                      className="text-xs text-rose-700 hover:underline px-1.5 font-medium"
                    >
                      رفض
                    </button>
                    <button
                      type="button"
                      onClick={async () => {
                        await onBulkAction(selectedIds, 'delete');
                        setSelectedIds([]);
                      }}
                      className="text-xs text-slate-700 hover:text-rose-700 px-1.5"
                    >
                      حذف
                    </button>
                  </div>
                )}
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <div className="relative">
                  <Search className="w-3.5 h-3.5 text-slate-400 absolute right-2.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="بحث في الإجابات أو المندوب..."
                    className="pr-8 pl-3 py-1.5 text-xs border border-slate-300 rounded-md w-56 focus:outline-none focus:ring-2 focus:ring-sky-500"
                  />
                </div>
                <select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value as 'all' | ValidationStatus)}
                  className="border border-slate-300 rounded-md px-2.5 py-1.5 text-xs bg-white focus:outline-none focus:ring-2 focus:ring-sky-500"
                >
                  <option value="all">حالة الاعتماد: عرض الكل</option>
                  <option value="approved">معتمد</option>
                  <option value="pending">قيد المراجعة</option>
                  <option value="on_hold">معلق للمتابعة</option>
                  <option value="rejected">مرفوض</option>
                </select>
              </div>
            </div>

            {/* Data Grid */}
            <div className="overflow-x-auto">
              <table className="w-full text-right border-collapse text-xs">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold">
                    <th className="p-2.5 w-9 text-center">
                      <input
                        type="checkbox"
                        checked={
                          filteredSubmissions.length > 0 &&
                          selectedIds.length === filteredSubmissions.length
                        }
                        onChange={toggleSelectAll}
                        className="w-3.5 h-3.5 rounded border-slate-300 text-sky-600"
                      />
                    </th>
                    <th className="p-2.5 w-16 whitespace-nowrap">إجراءات</th>
                    <th className="p-2.5 whitespace-nowrap">حالة الاعتماد</th>
                    <th className="p-2.5 whitespace-nowrap">تاريخ الإرسال</th>
                    <th className="p-2.5 whitespace-nowrap">المُرسل / المندوب</th>
                    {dataQuestions.slice(0, 8).map((q) => (
                      <th key={q.id} className="p-2.5 max-w-[180px] truncate whitespace-nowrap">
                        {q.label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {filteredSubmissions.length === 0 ? (
                    <tr>
                      <td
                        colSpan={5 + Math.min(8, dataQuestions.length)}
                        className="p-10 text-center text-slate-500"
                      >
                        لا توجد سجلات مطابقة لمعايير التصفية الحالية.
                      </td>
                    </tr>
                  ) : (
                    filteredSubmissions.map((sub) => {
                      const statusMeta = VALIDATION_STATUS_LABELS[sub.validationStatus];
                      return (
                        <tr
                          key={sub.id}
                          className="hover:bg-sky-50/30 transition-colors h-10"
                        >
                          <td className="p-2.5 text-center">
                            <input
                              type="checkbox"
                              checked={selectedIds.includes(sub.id)}
                              onChange={() => toggleRow(sub.id)}
                              className="w-3.5 h-3.5 rounded border-slate-300 text-sky-600"
                            />
                          </td>
                          <td className="p-2.5 whitespace-nowrap">
                            <div className="flex items-center gap-1.5">
                              <button
                                type="button"
                                onClick={() => setViewingSub(sub)}
                                title="معاينة التفاصيل الكاملة"
                                className="p-1 text-slate-500 hover:text-sky-600 rounded"
                              >
                                <Eye className="w-4 h-4" />
                              </button>
                              <button
                                type="button"
                                onClick={() => handleOpenEdit(sub)}
                                title="تعديل الإجابات"
                                className="p-1 text-slate-500 hover:text-sky-600 rounded"
                              >
                                <Edit2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </td>
                          <td className="p-2.5 whitespace-nowrap">
                            <select
                              value={sub.validationStatus}
                              onChange={(e) =>
                                onUpdateSubmission(sub.id, {
                                  validationStatus: e.target.value as ValidationStatus,
                                })
                              }
                              className={`border border-slate-200 rounded px-2 py-1 text-xs bg-white font-medium ${statusMeta.colorClass}`}
                            >
                              <option value="approved">معتمد</option>
                              <option value="pending">قيد المراجعة</option>
                              <option value="on_hold">معلق للمتابعة</option>
                              <option value="rejected">مرفوض</option>
                            </select>
                          </td>
                          <td className="p-2.5 whitespace-nowrap text-slate-600 tabular-nums">
                            {formatArabicDateTime(sub.submittedAt)}
                          </td>
                          <td className="p-2.5 whitespace-nowrap font-medium text-slate-800">
                            {sub.submittedBy}
                          </td>
                          {dataQuestions.slice(0, 8).map((q) => (
                            <td
                              key={q.id}
                              className="p-2.5 max-w-[200px] truncate text-slate-700 tabular-nums"
                              title={formatCellDisplay(sub.answers[q.name], q)}
                            >
                              {q.type === 'image' && sub.answers[q.name] ? (
                                <span className="text-sky-600 font-medium">صورة مرفقة</span>
                              ) : (
                                formatCellDisplay(sub.answers[q.name], q)
                              )}
                            </td>
                          ))}
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* 3. GALLERY SUB-TAB */}
        {activeSubTab === 'gallery' && (
          <div className="bg-white border border-slate-200 rounded-lg p-5 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <div>
                <h2 className="text-base font-semibold text-slate-900">
                  معرض الصور الميدانية ({galleryItems.length})
                </h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  صور واجهات الصيدليات البيطرية، أرفف العرض، ومستودعات سلسلة التبريد.
                </p>
              </div>
            </div>

            {galleryItems.length === 0 ? (
              <div className="py-12 text-center text-sm text-slate-500">
                لا توجد صور مرفقة ضمن استجابات هذا المشروع حتى الآن.
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
                {galleryItems.map((item, idx) => (
                  <button
                    key={`${item.sub.id}_${idx}`}
                    type="button"
                    onClick={() => setLightboxPhoto(item)}
                    className="group text-right border border-slate-200 rounded-lg overflow-hidden bg-white hover:border-sky-400 transition-colors"
                  >
                    <div className="aspect-[4/3] bg-slate-100 overflow-hidden relative">
                      <img
                        src={item.url}
                        alt={item.caption}
                        referrerPolicy="no-referrer"
                        className="w-full h-full object-cover group-hover:scale-[1.02] transition-transform duration-200"
                      />
                    </div>
                    <div className="p-3 space-y-1">
                      <div className="text-xs font-semibold text-slate-900 truncate">
                        {item.caption}
                      </div>
                      <div className="text-[11px] text-slate-500 flex items-center justify-between tabular-nums">
                        <span>{item.sub.submittedBy}</span>
                        <span>{formatArabicDateTime(item.sub.submittedAt)}</span>
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {/* 4. DOWNLOADS & INTEGRATIONS SUB-TAB */}
        {activeSubTab === 'downloads' && (
          <div className="space-y-5">
            <div className="bg-white border border-slate-200 rounded-lg p-5 space-y-4">
              <div className="border-b border-slate-200 pb-3">
                <h2 className="text-base font-semibold text-slate-900">
                  تصدير البيانات (Excel / CSV / JSON)
                </h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  تنزيل جميع الاستجابات الميدانية مع ترميز عربي سليم وتنسيق جاهز للتحليل الإداري.
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="border border-slate-200 rounded-lg p-4 flex flex-col justify-between gap-4">
                  <div>
                    <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
                      <FileSpreadsheet className="w-5 h-5 text-emerald-600" />
                      ملف Microsoft Excel (.xlsx)
                    </div>
                    <p className="text-xs text-slate-500 mt-1.5 leading-relaxed">
                      مصنف إكسل متكامل يضم ورقة البيانات الميدانية الكاملة وورقة ملخص التقرير باتجاه عربي RTL.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => exportProjectToExcel(project, submissions)}
                    className="w-full py-2 px-3 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold rounded-md inline-flex items-center justify-center gap-1.5"
                  >
                    <Download className="w-4 h-4" />
                    تنزيل Excel (.xlsx)
                  </button>
                </div>

                <div className="border border-slate-200 rounded-lg p-4 flex flex-col justify-between gap-4">
                  <div>
                    <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
                      <FileText className="w-5 h-5 text-sky-600" />
                      ملف جدول CSV (UTF-8 BOM)
                    </div>
                    <p className="text-xs text-slate-500 mt-1.5 leading-relaxed">
                      متوافق بالكامل مع قواعد البيانات، Google Sheets، وبرامج التحليل الإحصائي.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => exportProjectToCsv(project, submissions)}
                    className="w-full py-2 px-3 bg-sky-600 hover:bg-sky-700 text-white text-xs font-semibold rounded-md inline-flex items-center justify-center gap-1.5"
                  >
                    <Download className="w-4 h-4" />
                    تنزيل CSV
                  </button>
                </div>

                <div className="border border-slate-200 rounded-lg p-4 flex flex-col justify-between gap-4">
                  <div>
                    <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
                      <FileText className="w-5 h-5 text-slate-700" />
                      بيانات مهيكلة (JSON API)
                    </div>
                    <p className="text-xs text-slate-500 mt-1.5 leading-relaxed">
                      ملف JSON خام يشمل الإحداثيات الجغرافية وحالات الاعتماد والأرشفة البرمجية.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => exportProjectToJson(project, submissions)}
                    className="w-full py-2 px-3 border border-slate-300 bg-white hover:bg-slate-50 text-slate-800 text-xs font-semibold rounded-md inline-flex items-center justify-center gap-1.5"
                  >
                    <Download className="w-4 h-4" />
                    تنزيل JSON
                  </button>
                </div>
              </div>
            </div>

            {/* External BI & Google Sheets Connectors */}
            <div className="bg-white border border-slate-200 rounded-lg p-5 space-y-4">
              <div className="border-b border-slate-200 pb-3">
                <h3 className="text-base font-semibold text-slate-900">
                  الربط التلقائي مع Power BI و Google Sheets
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  استخدم الروابط الحية التالية لتحديث لوحات القيادة الإدارية وجداول البيانات تلقائياً.
                </p>
              </div>

              <div className="space-y-3">
                <div>
                  <div className="text-xs font-semibold text-slate-700 mb-1">
                    رابط Power BI (Get Data → Web / JSON Feed)
                  </div>
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      readOnly
                      dir="ltr"
                      value={apiJsonUrl}
                      className="flex-1 text-xs font-mono bg-slate-50 border border-slate-200 rounded px-3 py-2 text-slate-700"
                    />
                    <button
                      type="button"
                      onClick={() => copyText('pbi', apiJsonUrl)}
                      className="px-3 py-2 border border-slate-200 rounded text-xs font-medium hover:bg-slate-50 inline-flex items-center gap-1 whitespace-nowrap"
                    >
                      {copiedKey === 'pbi' ? (
                        <Check className="w-3.5 h-3.5 text-emerald-600" />
                      ) : (
                        <Copy className="w-3.5 h-3.5" />
                      )}
                      {copiedKey === 'pbi' ? 'تم النسخ' : 'نسخ الرابط'}
                    </button>
                  </div>
                </div>

                <div>
                  <div className="text-xs font-semibold text-slate-700 mb-1">
                    معادلة الربط المباشر في Google Sheets
                  </div>
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      readOnly
                      dir="ltr"
                      value={`=IMPORTDATA("${apiCsvUrl}")`}
                      className="flex-1 text-xs font-mono bg-slate-50 border border-slate-200 rounded px-3 py-2 text-slate-700"
                    />
                    <button
                      type="button"
                      onClick={() => copyText('gs', `=IMPORTDATA("${apiCsvUrl}")`)}
                      className="px-3 py-2 border border-slate-200 rounded text-xs font-medium hover:bg-slate-50 inline-flex items-center gap-1 whitespace-nowrap"
                    >
                      {copiedKey === 'gs' ? (
                        <Check className="w-3.5 h-3.5 text-emerald-600" />
                      ) : (
                        <Copy className="w-3.5 h-3.5" />
                      )}
                      {copiedKey === 'gs' ? 'تم النسخ' : 'نسخ المعادلة'}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* 5. MAP SUB-TAB */}
        {activeSubTab === 'map' && (
          <div className="grid grid-cols-1 xl:grid-cols-12 gap-4 items-stretch">
            <div className="xl:col-span-8 bg-white border border-slate-200 rounded-lg overflow-hidden flex flex-col">
              <div className="px-4 py-3 border-b border-slate-200 flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <MapPin className="w-4 h-4 text-sky-600" />
                  <span className="text-sm font-semibold text-slate-900">
                    خريطة التغطية الجغرافية ({geoSubmissions.length} نقطة GPS)
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <select
                    value={mapStatusFilter}
                    onChange={(e) =>
                      setMapStatusFilter(e.target.value as 'all' | ValidationStatus)
                    }
                    className="border border-slate-200 rounded px-2 py-1 text-xs bg-white"
                  >
                    <option value="all">كل النقاط</option>
                    <option value="approved">المعتمدة فقط</option>
                    <option value="pending">قيد المراجعة</option>
                    <option value="on_hold">معلقة</option>
                  </select>
                  <button
                    type="button"
                    onClick={() => setMapZoom((z) => Math.min(2.2, z + 0.25))}
                    className="p-1.5 border border-slate-200 rounded hover:bg-slate-50"
                    title="تكبير"
                  >
                    <ZoomIn className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setMapZoom((z) => Math.max(0.8, z - 0.25))}
                    className="p-1.5 border border-slate-200 rounded hover:bg-slate-50"
                    title="تصغير"
                  >
                    <ZoomOut className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setMapZoom(1)}
                    className="p-1.5 border border-slate-200 rounded hover:bg-slate-50"
                    title="إعادة ضبط"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              <div className="relative bg-slate-50 overflow-hidden h-[460px] flex items-center justify-center">
                <svg
                  viewBox="0 0 840 480"
                  className="w-full h-full transition-transform duration-200"
                  style={{ transform: `scale(${mapZoom})` }}
                >
                  {/* Coordinate Grid */}
                  <defs>
                    <pattern id="geoGrid" width="60" height="60" patternUnits="userSpaceOnUse">
                      <path
                        d="M 60 0 L 0 0 0 60"
                        fill="none"
                        stroke="#e2e8f0"
                        strokeWidth="1"
                      />
                    </pattern>
                  </defs>
                  <rect width="840" height="480" fill="#f8fafc" />
                  <rect width="840" height="480" fill="url(#geoGrid)" />

                  {/* Stylized Syria Geographic Contour */}
                  <path
                    d="M 76 168 L 122 125 L 220 96 L 375 88 L 560 74 L 748 52 L 775 78 L 718 148 L 688 228 L 570 302 L 315 390 L 200 432 L 118 442 L 96 408 L 118 358 L 94 282 L 78 224 Z"
                    fill="#eef6fc"
                    stroke="#cbd5e1"
                    strokeWidth="1.5"
                  />

                  {/* City Reference Labels */}
                  {REGION_CITIES.map((city) => {
                    const pt = projectCoord(city.lat, city.lng);
                    return (
                      <g key={city.name} transform={`translate(${pt.x}, ${pt.y})`}>
                        <circle r="3" fill="#94a3b8" />
                        <text
                          y="-8"
                          textAnchor="middle"
                          fontSize="11"
                          fill="#64748b"
                          fontWeight="500"
                        >
                          {city.name}
                        </text>
                      </g>
                    );
                  })}

                  {/* Submission GPS Pins */}
                  {geoSubmissions.map((sub) => {
                    const pt = projectCoord(sub.geoPoint!.lat, sub.geoPoint!.lng);
                    const isSelected = selectedMapSub?.id === sub.id;
                    const color = VALIDATION_STATUS_LABELS[sub.validationStatus].dotColor;
                    return (
                      <g
                        key={sub.id}
                        transform={`translate(${pt.x}, ${pt.y})`}
                        onClick={() => setSelectedMapSubId(sub.id)}
                        className="cursor-pointer"
                      >
                        {isSelected && (
                          <circle r="15" fill={color} fillOpacity="0.18" />
                        )}
                        <circle
                          r={isSelected ? '8.5' : '6.5'}
                          fill={color}
                          stroke="#ffffff"
                          strokeWidth="2"
                        />
                      </g>
                    );
                  })}
                </svg>

                {/* Map Legend */}
                <div className="absolute bottom-3 right-3 bg-white/95 border border-slate-200 rounded-md px-3 py-2 flex items-center gap-3 text-[11px] text-slate-600">
                  <span className="flex items-center gap-1">
                    <span className="w-2.5 h-2.5 rounded-full bg-emerald-600 inline-block" /> معتمد
                  </span>
                  <span className="flex items-center gap-1">
                    <span className="w-2.5 h-2.5 rounded-full bg-amber-600 inline-block" /> مراجعة
                  </span>
                  <span className="flex items-center gap-1">
                    <span className="w-2.5 h-2.5 rounded-full bg-sky-600 inline-block" /> معلق
                  </span>
                  <span className="flex items-center gap-1">
                    <span className="w-2.5 h-2.5 rounded-full bg-rose-600 inline-block" /> مرفوض
                  </span>
                </div>
              </div>
            </div>

            {/* Selected Pin Details */}
            <div className="xl:col-span-4 bg-white border border-slate-200 rounded-lg p-4 flex flex-col justify-between">
              {selectedMapSub ? (
                <div className="space-y-4">
                  <div className="border-b border-slate-200 pb-3">
                    <div className="text-xs text-slate-500">تفاصيل الموقع المحدد</div>
                    <h3 className="text-sm font-bold text-slate-900 mt-1">
                      {String(
                        selectedMapSub.answers.client_name ||
                          selectedMapSub.answers.distributor_name ||
                          selectedMapSub.submittedBy
                      )}
                    </h3>
                  </div>

                  <div className="grid grid-cols-2 gap-3 text-xs">
                    <div className="bg-slate-50 p-2.5 rounded border border-slate-200">
                      <div className="text-slate-500">خط العرض (Lat)</div>
                      <div className="font-mono font-semibold text-slate-900 mt-0.5 tabular-nums">
                        {selectedMapSub.geoPoint?.lat.toFixed(5)}
                      </div>
                    </div>
                    <div className="bg-slate-50 p-2.5 rounded border border-slate-200">
                      <div className="text-slate-500">خط الطول (Lng)</div>
                      <div className="font-mono font-semibold text-slate-900 mt-0.5 tabular-nums">
                        {selectedMapSub.geoPoint?.lng.toFixed(5)}
                      </div>
                    </div>
                  </div>

                  <div className="text-xs space-y-2">
                    <div className="flex justify-between">
                      <span className="text-slate-500">المندوب:</span>
                      <span className="font-medium text-slate-800">{selectedMapSub.submittedBy}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-500">الحالة:</span>
                      <span
                        className={`font-semibold ${
                          VALIDATION_STATUS_LABELS[selectedMapSub.validationStatus].colorClass
                        }`}
                      >
                        {VALIDATION_STATUS_LABELS[selectedMapSub.validationStatus].label}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-500">التاريخ:</span>
                      <span className="tabular-nums text-slate-700">
                        {formatArabicDateTime(selectedMapSub.submittedAt)}
                      </span>
                    </div>
                  </div>

                  {selectedMapSub.photos?.[0] && (
                    <div className="rounded-md overflow-hidden border border-slate-200 aspect-[4/3]">
                      <img
                        src={selectedMapSub.photos[0].url}
                        alt={selectedMapSub.photos[0].caption || 'صورة الموقع'}
                        referrerPolicy="no-referrer"
                        className="w-full h-full object-cover"
                      />
                    </div>
                  )}

                  <button
                    type="button"
                    onClick={() => setViewingSub(selectedMapSub)}
                    className="w-full py-2 bg-sky-600 hover:bg-sky-700 text-white rounded-md text-xs font-semibold"
                  >
                    عرض كامل بيانات الاستمارة
                  </button>
                </div>
              ) : (
                <div className="py-12 text-center text-sm text-slate-500">
                  لا توجد نقاط GPS مسجلة في هذا المشروع بعد.
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* View Submission Modal (Eye icon) */}
      {viewingSub && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-lg max-w-2xl w-full max-h-[88vh] overflow-y-auto">
            <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between">
              <div>
                <h3 className="text-base font-semibold text-slate-900">تفاصيل الاستجابة الميدانية</h3>
                <div className="text-xs text-slate-500 mt-0.5 tabular-nums">
                  المعرف: {viewingSub.id} · بواسطة {viewingSub.submittedBy} ·{' '}
                  {formatArabicDateTime(viewingSub.submittedAt)}
                </div>
              </div>
              <button
                type="button"
                onClick={() => setViewingSub(null)}
                className="text-slate-400 hover:text-slate-700 p-1"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-5 divide-y divide-slate-100">
              {project.questions
                .filter((q) => q.type !== 'note')
                .map((q) => {
                  const val = viewingSub.answers[q.name];
                  return (
                    <div key={q.id} className="py-3 first:pt-0 last:pb-0">
                      <div className="text-xs font-medium text-slate-500">{q.label}</div>
                      {q.type === 'image' && typeof val === 'string' && val ? (
                        <img
                          src={val}
                          alt={q.label}
                          referrerPolicy="no-referrer"
                          className="mt-2 max-h-56 rounded-md border border-slate-200 object-cover"
                        />
                      ) : (
                        <div className="text-sm font-medium text-slate-900 mt-1 tabular-nums">
                          {formatCellDisplay(val, q)}
                        </div>
                      )}
                    </div>
                  );
                })}
            </div>

            <div className="px-5 py-3.5 border-t border-slate-200 bg-slate-50 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={async () => {
                    await onUpdateSubmission(viewingSub.id, { validationStatus: 'approved' });
                    setViewingSub({ ...viewingSub, validationStatus: 'approved' });
                  }}
                  className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded text-xs font-medium"
                >
                  اعتماد
                </button>
                <button
                  type="button"
                  onClick={async () => {
                    await onUpdateSubmission(viewingSub.id, { validationStatus: 'rejected' });
                    setViewingSub({ ...viewingSub, validationStatus: 'rejected' });
                  }}
                  className="px-3 py-1.5 bg-rose-600 hover:bg-rose-700 text-white rounded text-xs font-medium"
                >
                  رفض
                </button>
              </div>
              <button
                type="button"
                onClick={async () => {
                  await onBulkAction([viewingSub.id], 'delete');
                  setViewingSub(null);
                }}
                className="px-3 py-1.5 border border-rose-200 text-rose-700 hover:bg-rose-50 rounded text-xs font-medium inline-flex items-center gap-1"
              >
                <Trash2 className="w-3.5 h-3.5" />
                حذف السجل
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Submission Modal (Pencil icon) */}
      {editingSub && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 flex items-center justify-center p-4">
          <form
            onSubmit={handleSaveEdit}
            className="bg-white border border-slate-200 rounded-lg max-w-xl w-full max-h-[88vh] overflow-y-auto"
          >
            <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between">
              <h3 className="text-base font-semibold text-slate-900">تعديل بيانات الاستجابة</h3>
              <button
                type="button"
                onClick={() => setEditingSub(null)}
                className="text-slate-400 hover:text-slate-700 p-1"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-5 space-y-4">
              {project.questions
                .filter((q) => q.type !== 'note' && q.type !== 'image' && q.type !== 'geopoint')
                .map((q) => {
                  const val = editDraftAnswers[q.name];
                  return (
                    <div key={q.id}>
                      <label className="block text-xs font-medium text-slate-700 mb-1">
                        {q.label}
                      </label>
                      {q.type === 'select_one' && q.options ? (
                        <select
                          value={String(val ?? '')}
                          onChange={(e) =>
                            setEditDraftAnswers((prev) => ({ ...prev, [q.name]: e.target.value }))
                          }
                          className="w-full border border-slate-300 rounded px-3 py-2 text-sm bg-white"
                        >
                          <option value="">— اختر —</option>
                          {q.options.map((opt) => (
                            <option key={opt.value} value={opt.value}>
                              {opt.label}
                            </option>
                          ))}
                        </select>
                      ) : q.type === 'integer' || q.type === 'decimal' || q.type === 'rating' || q.type === 'range' ? (
                        <input
                          type="number"
                          step="any"
                          value={val !== undefined && val !== null ? String(val) : ''}
                          onChange={(e) =>
                            setEditDraftAnswers((prev) => ({
                              ...prev,
                              [q.name]: e.target.value === '' ? '' : Number(e.target.value),
                            }))
                          }
                          className="w-full border border-slate-300 rounded px-3 py-2 text-sm tabular-nums"
                        />
                      ) : (
                        <input
                          type="text"
                          value={Array.isArray(val) ? val.join(', ') : String(val ?? '')}
                          onChange={(e) =>
                            setEditDraftAnswers((prev) => ({ ...prev, [q.name]: e.target.value }))
                          }
                          className="w-full border border-slate-300 rounded px-3 py-2 text-sm"
                        />
                      )}
                    </div>
                  );
                })}
            </div>

            <div className="px-5 py-3.5 border-t border-slate-200 bg-slate-50 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setEditingSub(null)}
                className="px-4 py-2 border border-slate-300 rounded-md text-xs font-medium text-slate-700 bg-white"
              >
                إلغاء
              </button>
              <button
                type="submit"
                className="px-4 py-2 bg-sky-600 hover:bg-sky-700 text-white rounded-md text-xs font-semibold"
              >
                حفظ التعديلات
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Gallery Lightbox Modal */}
      {lightboxPhoto && (
        <div
          className="fixed inset-0 z-50 bg-slate-900/75 flex items-center justify-center p-4"
          onClick={() => setLightboxPhoto(null)}
        >
          <div
            className="bg-white rounded-lg max-w-3xl w-full overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-4 py-3 border-b border-slate-200 flex items-center justify-between">
              <div className="text-sm font-semibold text-slate-900">{lightboxPhoto.caption}</div>
              <button
                type="button"
                onClick={() => setLightboxPhoto(null)}
                className="text-slate-500 hover:text-slate-800"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="bg-slate-950 flex items-center justify-center max-h-[65vh]">
              <img
                src={lightboxPhoto.url}
                alt={lightboxPhoto.caption}
                referrerPolicy="no-referrer"
                className="max-h-[65vh] w-auto object-contain"
              />
            </div>
            <div className="px-4 py-3 bg-slate-50 text-xs text-slate-600 flex items-center justify-between tabular-nums">
              <span>المندوب: {lightboxPhoto.sub.submittedBy}</span>
              <span>{formatArabicDateTime(lightboxPhoto.sub.submittedAt)}</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

interface QuestionReportCardProps {
  index: number;
  question: FormQuestion;
  submissions: FormSubmission[];
}

const QuestionReportCard: React.FC<QuestionReportCardProps> = ({
  index,
  question,
  submissions,
}) => {
  const answeredValues = submissions
    .map((s) => s.answers[question.name])
    .filter((v) => v !== undefined && v !== null && v !== '' && (!Array.isArray(v) || v.length > 0));

  const isChoice =
    question.type === 'select_one' ||
    question.type === 'select_multiple' ||
    question.type === 'acknowledge';

  const isNumeric =
    question.type === 'integer' ||
    question.type === 'decimal' ||
    question.type === 'rating' ||
    question.type === 'range' ||
    question.type === 'calculate';

  if (isChoice) {
    const counts = new Map<string, number>();
    if (question.type === 'acknowledge') {
      counts.set('موافق', 0);
      counts.set('غير موافق', 0);
    } else {
      for (const opt of question.options || []) {
        counts.set(opt.value, 0);
      }
    }

    for (const val of answeredValues) {
      if (Array.isArray(val)) {
        for (const item of val) {
          const key = String(item);
          counts.set(key, (counts.get(key) ?? 0) + 1);
        }
      } else if (question.type === 'acknowledge') {
        const key = val ? 'موافق' : 'غير موافق';
        counts.set(key, (counts.get(key) ?? 0) + 1);
      } else {
        const key = String(val);
        counts.set(key, (counts.get(key) ?? 0) + 1);
      }
    }

    const totalBase = Math.max(1, answeredValues.length);
    const rows = Array.from(counts.entries())
      .map(([key, count]) => ({
        label: question.options?.find((o) => o.value === key)?.label ?? key,
        count,
        pct: Math.round((count / totalBase) * 100),
      }))
      .sort((a, b) => b.count - a.count);

    return (
      <div className="bg-white border border-slate-200 rounded-lg p-5 space-y-3 break-inside-avoid">
        <div className="flex items-start justify-between gap-4">
          <h3 className="text-sm font-semibold text-slate-900">
            {index}. {question.label}
          </h3>
          <span className="text-xs text-slate-500 tabular-nums whitespace-nowrap shrink-0">
            عدد المجيبين: {answeredValues.length}
          </span>
        </div>

        <div className="space-y-2.5 pt-1">
          {rows.map((r) => (
            <div key={r.label} className="space-y-1">
              <div className="flex items-center justify-between text-xs">
                <span className="text-slate-700 font-medium">{r.label}</span>
                <span className="text-slate-600 tabular-nums font-mono">
                  {r.count} ({r.pct}%)
                </span>
              </div>
              <div className="h-2.5 bg-slate-100 rounded-full overflow-hidden">
                <div
                  className="h-full bg-sky-500 rounded-full transition-all duration-300"
                  style={{ width: `${r.pct}%` }}
                />
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (isNumeric) {
    const nums = answeredValues.map(Number).filter((n) => Number.isFinite(n));
    const sum = nums.reduce((acc, n) => acc + n, 0);
    const avg = nums.length > 0 ? Math.round((sum / nums.length) * 100) / 100 : 0;
    const min = nums.length > 0 ? Math.min(...nums) : 0;
    const max = nums.length > 0 ? Math.max(...nums) : 0;

    return (
      <div className="bg-white border border-slate-200 rounded-lg p-5 space-y-3 break-inside-avoid">
        <div className="flex items-start justify-between gap-4">
          <h3 className="text-sm font-semibold text-slate-900">
            {index}. {question.label}
          </h3>
          <span className="text-xs text-slate-500 tabular-nums whitespace-nowrap shrink-0">
            عدد القيم: {nums.length}
          </span>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-1">
          <div className="border border-slate-200 rounded p-3 bg-slate-50/50">
            <div className="text-[11px] text-slate-500">المتوسط الحسابي</div>
            <div className="text-lg font-bold text-sky-700 mt-0.5 tabular-nums">{avg}</div>
          </div>
          <div className="border border-slate-200 rounded p-3 bg-slate-50/50">
            <div className="text-[11px] text-slate-500">الحد الأدنى</div>
            <div className="text-lg font-bold text-slate-800 mt-0.5 tabular-nums">{min}</div>
          </div>
          <div className="border border-slate-200 rounded p-3 bg-slate-50/50">
            <div className="text-[11px] text-slate-500">الحد الأعلى</div>
            <div className="text-lg font-bold text-slate-800 mt-0.5 tabular-nums">{max}</div>
          </div>
          <div className="border border-slate-200 rounded p-3 bg-slate-50/50">
            <div className="text-[11px] text-slate-500">الإجمالي التراكمي</div>
            <div className="text-lg font-bold text-slate-900 mt-0.5 tabular-nums">
              {Math.round(sum * 100) / 100}
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Text / Matrix / Geopoint / Image summary list
  return (
    <div className="bg-white border border-slate-200 rounded-lg p-5 space-y-2.5 break-inside-avoid">
      <div className="flex items-start justify-between gap-4">
        <h3 className="text-sm font-semibold text-slate-900">
          {index}. {question.label}
        </h3>
        <span className="text-xs text-slate-500 tabular-nums whitespace-nowrap shrink-0">
          {answeredValues.length} إدخال
        </span>
      </div>
      {answeredValues.length === 0 ? (
        <div className="text-xs text-slate-400">لا توجد إدخالات مسجلة لهذا الحقل.</div>
      ) : (
        <ul className="divide-y divide-slate-100 text-xs text-slate-700">
          {submissions
            .filter((s) => s.answers[question.name] !== undefined && s.answers[question.name] !== '')
            .slice(0, 5)
            .map((s) => (
              <li key={s.id} className="py-2 flex items-start justify-between gap-4">
                <span className="leading-relaxed">
                  {question.type === 'image'
                    ? 'تم إرفاق صورة ميدانية موثقة'
                    : formatCellDisplay(s.answers[question.name], question)}
                </span>
                <span className="text-slate-400 whitespace-nowrap shrink-0">
                  {s.submittedBy}
                </span>
              </li>
            ))}
        </ul>
      )}
    </div>
  );
};
