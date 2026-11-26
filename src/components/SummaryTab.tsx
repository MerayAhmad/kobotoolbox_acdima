import React, { useMemo, useState } from 'react';
import {
  BarChart3,
  Check,
  Copy,
  Download,
  ExternalLink,
  Eye,
  Image as ImageIcon,
  MapPin,
  Table as TableIcon,
} from 'lucide-react';
import type { FormSubmission, Project } from '../types/kobo';
import { formatArabicDate, formatArabicDateTime } from '../utils/skipLogic';

interface SummaryTabProps {
  project: Project;
  submissions: FormSubmission[];
  onNavigateDataTab: (subTab: 'reports' | 'table' | 'gallery' | 'downloads' | 'map') => void;
  onOpenCollector: (previewOnly: boolean) => void;
  onNavigateSettingsSharing: () => void;
}

export const SummaryTab: React.FC<SummaryTabProps> = ({
  project,
  submissions,
  onNavigateDataTab,
  onOpenCollector,
  onNavigateSettingsSharing,
}) => {
  const [rangeDays, setRangeDays] = useState<7 | 31>(7);
  const [copiedLink, setCopiedLink] = useState(false);

  const shareUrl = `${window.location.origin}/#/collect/${project.id}`;

  const handleCopyLink = () => {
    navigator.clipboard.writeText(shareUrl).catch(() => {});
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2000);
  };

  const chartData = useMemo(() => {
    const days: { dateKey: string; label: string; count: number }[] = [];
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    for (let i = rangeDays - 1; i >= 0; i--) {
      const d = new Date(today);
      d.setDate(d.getDate() - i);
      const dateKey = d.toISOString().slice(0, 10);
      const label = d.toLocaleDateString('ar-SA', { day: '2-digit', month: 'short' });
      days.push({ dateKey, label, count: 0 });
    }

    for (const sub of submissions) {
      const key = new Date(sub.submittedAt).toISOString().slice(0, 10);
      const bucket = days.find((d) => d.dateKey === key);
      if (bucket) bucket.count += 1;
    }

    return days;
  }, [submissions, rangeDays]);

  const stats = useMemo(() => {
    const now = Date.now();
    const dayMs = 86400000;
    const last7 = submissions.filter((s) => now - new Date(s.submittedAt).getTime() <= 7 * dayMs).length;
    const prev7 = submissions.filter((s) => {
      const diff = now - new Date(s.submittedAt).getTime();
      return diff > 7 * dayMs && diff <= 14 * dayMs;
    }).length;
    const latest = submissions
      .map((s) => s.submittedAt)
      .sort((a, b) => new Date(b).getTime() - new Date(a).getTime())[0];

    return {
      last7,
      prev7,
      total: submissions.length,
      latest,
    };
  }, [submissions]);

  const maxBar = Math.max(1, ...chartData.map((d) => d.count));

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
      {/* Main Column */}
      <div className="lg:col-span-8 space-y-6">
        {/* 1. Description */}
        <section className="bg-white border border-slate-200 rounded-lg overflow-hidden">
          <div className="px-5 py-3.5 border-b border-slate-200 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-slate-900">وصف المشروع</h2>
            <span className="text-xs text-slate-500 tabular-nums">
              الإصدار v{project.version} · {project.status === 'deployed' ? 'منشور للجمع الميداني' : project.status === 'draft' ? 'مسودة' : 'مؤرشف'}
            </span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 border-b border-slate-100">
            <div className="px-5 py-3.5 sm:border-l sm:border-slate-100">
              <div className="text-xs text-slate-500 mb-1">النطاق الجغرافي</div>
              <div className="text-sm font-medium text-slate-900">{project.country}</div>
            </div>
            <div className="px-5 py-3.5 border-t sm:border-t-0 border-slate-100">
              <div className="text-xs text-slate-500 mb-1">القطاع</div>
              <div className="text-sm font-medium text-slate-900">{project.sector}</div>
            </div>
          </div>
          <div className="px-5 py-4 text-sm text-slate-700 leading-relaxed">
            {project.description || 'لا يوجد وصف مضاف لهذا المشروع بعد.'}
          </div>
        </section>

        {/* 2. Submissions Chart */}
        <section className="bg-white border border-slate-200 rounded-lg overflow-hidden">
          <div className="px-5 py-3.5 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-sm font-semibold text-slate-900">نشاط جمع البيانات (الاستجابات)</h2>
            <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-md">
              <button
                type="button"
                onClick={() => setRangeDays(7)}
                className={`px-3 py-1 text-xs font-medium rounded transition-colors whitespace-nowrap shrink-0 ${
                  rangeDays === 7
                    ? 'bg-white text-sky-700 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                آخر 7 أيام
              </button>
              <button
                type="button"
                onClick={() => setRangeDays(31)}
                className={`px-3 py-1 text-xs font-medium rounded transition-colors whitespace-nowrap shrink-0 ${
                  rangeDays === 31
                    ? 'bg-white text-sky-700 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                آخر 31 يوماً
              </button>
            </div>
          </div>

          <div className="p-5">
            {/* Bar Chart */}
            <div className="h-48 flex items-end gap-1.5 border-b border-slate-200 pb-2 pt-4">
              {chartData.map((day) => {
                const heightPct = Math.round((day.count / maxBar) * 100);
                return (
                  <div
                    key={day.dateKey}
                    className="flex-1 h-full flex flex-col items-center justify-end group relative"
                  >
                    <div
                      className="w-full max-w-[32px] rounded-t transition-all duration-200 bg-sky-400/80 hover:bg-sky-500"
                      style={{ height: day.count > 0 ? `${Math.max(heightPct, 10)}%` : '2px', opacity: day.count > 0 ? 1 : 0.25 }}
                    />
                    <div className="pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity absolute -top-7 bg-slate-900 text-white text-[11px] px-2 py-0.5 rounded whitespace-nowrap z-10 tabular-nums">
                      {day.label}: {day.count}
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="flex items-center justify-between text-[11px] text-slate-500 mt-2 tabular-nums">
              <span>{chartData[0]?.label}</span>
              <span>{chartData[Math.floor(chartData.length / 2)]?.label}</span>
              <span>{chartData[chartData.length - 1]?.label}</span>
            </div>

            {/* Three KPI Cards matching KoboToolbox Summary */}
            <div className="grid grid-cols-3 gap-4 mt-5">
              <div className="border border-slate-200 rounded-md p-3.5 bg-slate-50/50">
                <div className="text-2xl font-bold text-sky-600 tabular-nums">{stats.last7}</div>
                <div className="text-xs text-slate-600 mt-1">آخر 7 أيام</div>
              </div>
              <div className="border border-slate-200 rounded-md p-3.5 bg-slate-50/50">
                <div className="text-2xl font-bold text-sky-600 tabular-nums">{stats.prev7}</div>
                <div className="text-xs text-slate-600 mt-1">الأسبوع السابق</div>
              </div>
              <div className="border border-slate-200 rounded-md p-3.5 bg-slate-50/50">
                <div className="text-2xl font-bold text-sky-600 tabular-nums">{stats.total}</div>
                <div className="text-xs text-slate-600 mt-1">الإجمالي الكلي</div>
              </div>
            </div>
          </div>
        </section>

        {/* 3. Form Details */}
        <section className="bg-white border border-slate-200 rounded-lg overflow-hidden">
          <div className="px-5 py-3.5 border-b border-slate-200">
            <h2 className="text-sm font-semibold text-slate-900">تفاصيل النموذج</h2>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 divide-y sm:divide-y-0 sm:divide-x sm:divide-x-reverse divide-slate-100">
            <div className="px-5 py-4">
              <div className="text-xs text-slate-500 mb-1">آخر تعديل للنموذج</div>
              <div className="text-sm font-medium text-slate-900 tabular-nums">
                {formatArabicDate(project.updatedAt)}
              </div>
            </div>
            <div className="px-5 py-4">
              <div className="text-xs text-slate-500 mb-1">أحدث استجابة واردة</div>
              <div className="text-sm font-medium text-slate-900 tabular-nums">
                {formatArabicDateTime(stats.latest)}
              </div>
            </div>
            <div className="px-5 py-4">
              <div className="text-xs text-slate-500 mb-1">عدد الأسئلة</div>
              <div className="text-sm font-semibold text-slate-900 tabular-nums">
                {project.questions.length} سؤالاً
              </div>
            </div>
          </div>
        </section>
      </div>

      {/* Side Column */}
      <div className="lg:col-span-4 space-y-6">
        {/* 4. Quick Links */}
        <section className="bg-white border border-slate-200 rounded-lg overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-200">
            <h3 className="text-sm font-semibold text-slate-900">روابط سريعة</h3>
          </div>
          <div className="divide-y divide-slate-100">
            <button
              type="button"
              onClick={() => onOpenCollector(false)}
              className="w-full px-4 py-3 flex items-center justify-between text-sm text-slate-700 hover:bg-slate-50 transition-colors"
            >
              <span className="flex items-center gap-2.5 font-medium">
                <ExternalLink className="w-4 h-4 text-sky-600" />
                جمع البيانات (فتح الاستمارة)
              </span>
              <span className="text-xs text-sky-600">فتح</span>
            </button>
            <button
              type="button"
              onClick={() => onOpenCollector(true)}
              className="w-full px-4 py-3 flex items-center justify-between text-sm text-slate-700 hover:bg-slate-50 transition-colors"
            >
              <span className="flex items-center gap-2.5 font-medium">
                <Eye className="w-4 h-4 text-slate-500" />
                معاينة النموذج
              </span>
              <span className="text-xs text-slate-400">معاينة</span>
            </button>
            <div className="px-4 py-3 bg-slate-50/70">
              <div className="text-xs text-slate-500 mb-1.5">رابط الإرسال للمندوبين والعملاء</div>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  readOnly
                  value={shareUrl}
                  dir="ltr"
                  className="flex-1 text-xs font-mono bg-white border border-slate-200 rounded px-2.5 py-1.5 text-slate-600 truncate"
                />
                <button
                  type="button"
                  onClick={handleCopyLink}
                  className="px-2.5 py-1.5 bg-white border border-slate-200 rounded text-xs font-medium text-slate-700 hover:bg-slate-100 flex items-center gap-1 whitespace-nowrap shrink-0"
                >
                  {copiedLink ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                  {copiedLink ? 'تم النسخ' : 'نسخ'}
                </button>
              </div>
            </div>
          </div>
        </section>

        {/* 5. Data Quick Links */}
        <section className="bg-white border border-slate-200 rounded-lg overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-200">
            <h3 className="text-sm font-semibold text-slate-900">البيانات والتقارير</h3>
          </div>
          <div className="divide-y divide-slate-100">
            {[
              { id: 'reports' as const, label: 'التقارير الإحصائية', icon: BarChart3 },
              { id: 'table' as const, label: 'جدول الاستجابات', icon: TableIcon },
              { id: 'gallery' as const, label: 'معرض الصور الميدانية', icon: ImageIcon },
              { id: 'downloads' as const, label: 'التنزيلات (Excel / CSV) والربط', icon: Download },
              { id: 'map' as const, label: 'خريطة المواقع الجغرافية GPS', icon: MapPin },
            ].map((item) => {
              const Icon = item.icon;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => onNavigateDataTab(item.id)}
                  className="w-full px-4 py-3 flex items-center justify-between text-sm text-slate-700 hover:bg-slate-50 transition-colors"
                >
                  <span className="flex items-center gap-2.5">
                    <Icon className="w-4 h-4 text-slate-500" />
                    {item.label}
                  </span>
                  <span className="text-slate-400 text-xs">←</span>
                </button>
              );
            })}
          </div>
        </section>

        {/* 6. Team Members */}
        <section className="bg-white border border-slate-200 rounded-lg overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-200 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-slate-900">أعضاء الفريق</h3>
            <button
              type="button"
              onClick={onNavigateSettingsSharing}
              className="text-xs text-sky-600 hover:text-sky-700 font-medium"
            >
              إدارة الصلاحيات
            </button>
          </div>
          <div className="p-4 flex flex-wrap items-center gap-2.5">
            {project.team.map((member) => (
              <button
                key={member.id}
                type="button"
                onClick={onNavigateSettingsSharing}
                title={`${member.fullName} — ${member.roleTitle}`}
                className="flex items-center gap-2 pr-1 pl-2.5 py-1 rounded-md border border-slate-200 hover:border-sky-300 transition-colors bg-slate-50/50"
              >
                <span
                  className="w-7 h-7 rounded-full flex items-center justify-center text-white text-xs font-bold shrink-0"
                  style={{ backgroundColor: member.avatarColor }}
                >
                  {member.fullName.trim().charAt(0)}
                </span>
                <span className="text-xs font-medium text-slate-700 whitespace-nowrap">
                  {member.fullName}
                </span>
              </button>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
};
