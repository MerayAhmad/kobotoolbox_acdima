import React, { useState } from 'react';
import { Check, Edit2, Plus, ShieldCheck, UserPlus, X } from 'lucide-react';
import type { PermissionKey, Project, ProjectStatus, TeamMember } from '../types/kobo';
import { formatArabicDateTime } from '../utils/skipLogic';

interface SettingsTabProps {
  project: Project;
  initialSection?: 'general' | 'sharing' | 'audit';
  onSaveProject: (
    updates: Partial<Project> & { auditAction?: string; auditDetails?: string }
  ) => Promise<void>;
}

const PERMISSION_LABELS: Record<PermissionKey, string> = {
  view_form: 'عرض النموذج',
  edit_form: 'تعديل النموذج',
  view_submissions: 'عرض الإجابات',
  view_submissions_own: 'عرض الإجابات من مستخدمين محددين فقط',
  view_submissions_cond: 'عرض الإجابات بناءً على شرط محدد',
  add_submissions: 'إضافة إجابات',
  edit_submissions: 'تعديل الإجابات',
  edit_submissions_own: 'تعديل إجابات مستخدمين محددين فقط',
  edit_submissions_cond: 'تعديل الإجابات بناءً على شرط محدد',
  validate_submissions: 'اعتماد الإجابات',
  validate_submissions_own: 'اعتماد إجابات مستخدمين محددين فقط',
  validate_submissions_cond: 'اعتماد الإجابات بناءً على شرط محدد',
  delete_submissions: 'حذف الإجابات',
  delete_submissions_own: 'حذف إجابات مستخدمين محددين فقط',
  delete_submissions_cond: 'حذف الإجابات بناءً على شرط محدد',
  manage_project: 'إدارة المشروع بالكامل',
};

const PERMISSION_TREE: { key: PermissionKey; children?: PermissionKey[] }[] = [
  { key: 'view_form' },
  { key: 'edit_form' },
  {
    key: 'view_submissions',
    children: ['view_submissions_own', 'view_submissions_cond'],
  },
  { key: 'add_submissions' },
  {
    key: 'edit_submissions',
    children: ['edit_submissions_own', 'edit_submissions_cond'],
  },
  {
    key: 'validate_submissions',
    children: ['validate_submissions_own', 'validate_submissions_cond'],
  },
  {
    key: 'delete_submissions',
    children: ['delete_submissions_own', 'delete_submissions_cond'],
  },
  { key: 'manage_project' },
];

export const SettingsTab: React.FC<SettingsTabProps> = ({
  project,
  initialSection = 'general',
  onSaveProject,
}) => {
  const [section, setSection] = useState<'general' | 'sharing' | 'audit'>(initialSection);
  const [title, setTitle] = useState(project.title);
  const [sector, setSector] = useState(project.sector);
  const [country, setCountry] = useState(project.country);
  const [description, setDescription] = useState(project.description);
  const [status, setStatus] = useState<ProjectStatus>(project.status);
  const [allowOffline, setAllowOffline] = useState(project.allowOffline);
  const [webhookUrl, setWebhookUrl] = useState(project.webhookUrl || '');
  const [saving, setSaving] = useState(false);
  const [savedMsg, setSavedMsg] = useState('');

  // Sharing state matching Screenshot 1 (7_b8051b68.jpg)
  const [editingMemberId, setEditingMemberId] = useState<string | null>(
    project.team[0]?.id ?? null
  );
  const [draftPermissions, setDraftPermissions] = useState<PermissionKey[]>(
    project.team[0]?.permissions ?? []
  );
  const [newUsername, setNewUsername] = useState('');
  const [newFullName, setNewFullName] = useState('');
  const [newRoleTitle, setNewRoleTitle] = useState('');

  const handleSaveGeneral = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await onSaveProject({
        title,
        sector,
        country,
        description,
        status,
        allowOffline,
        webhookUrl,
        auditAction: 'تحديث إعدادات المشروع',
        auditDetails: `حالة المشروع: ${status} · وضع عدم الاتصال: ${allowOffline ? 'مفعل' : 'معطل'}`,
      });
      setSavedMsg('تم حفظ الإعدادات بنجاح');
      setTimeout(() => setSavedMsg(''), 2500);
    } finally {
      setSaving(false);
    }
  };

  const handleSelectMemberForEdit = (member: TeamMember) => {
    setEditingMemberId(member.id);
    setDraftPermissions([...member.permissions]);
  };

  const togglePermission = (key: PermissionKey) => {
    setDraftPermissions((prev) =>
      prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]
    );
  };

  const handleUpdatePermissions = async () => {
    if (!editingMemberId) return;
    setSaving(true);
    try {
      const nextTeam = project.team.map((m) =>
        m.id === editingMemberId ? { ...m, permissions: draftPermissions } : m
      );
      const member = project.team.find((m) => m.id === editingMemberId);
      await onSaveProject({
        team: nextTeam,
        auditAction: 'تحديث صلاحيات مستخدم',
        auditDetails: `تحديث صلاحيات ${member?.fullName || editingMemberId} (${draftPermissions.length} صلاحية).`,
      });
      setSavedMsg('تم تحديث الصلاحيات بنجاح');
      setTimeout(() => setSavedMsg(''), 2500);
    } finally {
      setSaving(false);
    }
  };

  const handleAddMember = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newUsername.trim() || !newFullName.trim()) return;
    const colors = ['#0284c7', '#0f766e', '#1d4ed8', '#b45309', '#4338ca'];
    const newMember: TeamMember = {
      id: `tm_${Date.now()}`,
      username: newUsername.trim(),
      fullName: newFullName.trim(),
      roleTitle: newRoleTitle.trim() || 'مندوب ميداني',
      avatarColor: colors[project.team.length % colors.length],
      permissions: ['view_form', 'add_submissions', 'view_submissions_own'],
    };
    const nextTeam = [...project.team, newMember];
    setSaving(true);
    try {
      await onSaveProject({
        team: nextTeam,
        auditAction: 'إضافة عضو جديد للفريق',
        auditDetails: `إضافة ${newMember.fullName} (${newMember.username}) بصلاحيات جمع البيانات.`,
      });
      setNewUsername('');
      setNewFullName('');
      setNewRoleTitle('');
      setEditingMemberId(newMember.id);
      setDraftPermissions(newMember.permissions);
    } finally {
      setSaving(false);
    }
  };

  const handleRemoveMember = async (memberId: string) => {
    if (project.team.length <= 1) return;
    const removed = project.team.find((m) => m.id === memberId);
    const nextTeam = project.team.filter((m) => m.id !== memberId);
    await onSaveProject({
      team: nextTeam,
      auditAction: 'إزالة مستخدم من المشروع',
      auditDetails: `إزالة ${removed?.fullName || memberId} من قائمة صلاحيات المشروع.`,
    });
    if (editingMemberId === memberId) {
      setEditingMemberId(nextTeam[0]?.id ?? null);
      setDraftPermissions(nextTeam[0]?.permissions ?? []);
    }
  };

  const editingMember = project.team.find((m) => m.id === editingMemberId) || null;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
      {/* Side Sub-Nav */}
      <aside className="lg:col-span-3 bg-white border border-slate-200 rounded-lg overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-200 text-xs font-semibold text-slate-500">
          إعدادات المشروع
        </div>
        <nav className="divide-y divide-slate-100">
          <button
            type="button"
            onClick={() => setSection('general')}
            className={`w-full text-right px-4 py-3 text-sm font-medium transition-colors ${
              section === 'general'
                ? 'bg-sky-50 text-sky-700 font-semibold'
                : 'text-slate-700 hover:bg-slate-50'
            }`}
          >
            البيانات العامة والربط
          </button>
          <button
            type="button"
            onClick={() => setSection('sharing')}
            className={`w-full text-right px-4 py-3 text-sm font-medium transition-colors ${
              section === 'sharing'
                ? 'bg-sky-50 text-sky-700 font-semibold'
                : 'text-slate-700 hover:bg-slate-50'
            }`}
          >
            المشاركة وصلاحيات المستخدمين
          </button>
          <button
            type="button"
            onClick={() => setSection('audit')}
            className={`w-full text-right px-4 py-3 text-sm font-medium transition-colors ${
              section === 'audit'
                ? 'bg-sky-50 text-sky-700 font-semibold'
                : 'text-slate-700 hover:bg-slate-50'
            }`}
          >
            سجل التعديلات والرقابة
          </button>
        </nav>
      </aside>

      {/* Main Content */}
      <div className="lg:col-span-9 space-y-6">
        {savedMsg && (
          <div className="bg-emerald-50 border border-emerald-200 text-emerald-800 px-4 py-2.5 rounded-lg text-sm flex items-center gap-2">
            <Check className="w-4 h-4 text-emerald-600" />
            {savedMsg}
          </div>
        )}

        {section === 'general' && (
          <form
            onSubmit={handleSaveGeneral}
            className="bg-white border border-slate-200 rounded-lg p-6 space-y-5"
          >
            <div className="border-b border-slate-200 pb-3">
              <h2 className="text-base font-semibold text-slate-900">إعدادات المشروع العامة</h2>
              <p className="text-xs text-slate-500 mt-1">
                تحديث معلومات الاستبيان، حالة النشر، وإعدادات العمل الميداني دون إنترنت.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1.5">
                  عنوان المشروع / الاستمارة
                </label>
                <input
                  type="text"
                  required
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1.5">
                  حالة النموذج
                </label>
                <select
                  value={status}
                  onChange={(e) => setStatus(e.target.value as ProjectStatus)}
                  className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-sky-500"
                >
                  <option value="deployed">منشور (نشط لجمع البيانات)</option>
                  <option value="draft">مسودة (قيد التصميم)</option>
                  <option value="archived">مؤرشف (مغلق)</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1.5">القطاع</label>
                <input
                  type="text"
                  value={sector}
                  onChange={(e) => setSector(e.target.value)}
                  className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1.5">
                  الدولة / المنطقة
                </label>
                <input
                  type="text"
                  value={country}
                  onChange={(e) => setCountry(e.target.value)}
                  className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1.5">
                وصف المشروع والأهداف الميدانية
              </label>
              <textarea
                rows={3}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500"
              />
            </div>

            <div className="border-t border-slate-100 pt-4 space-y-4">
              <label className="flex items-start gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={allowOffline}
                  onChange={(e) => setAllowOffline(e.target.checked)}
                  className="mt-1 w-4 h-4 rounded border-slate-300 text-sky-600 focus:ring-sky-500"
                />
                <div>
                  <div className="text-sm font-medium text-slate-900">
                    تمكين الحفظ المحلي والعمل دون إنترنت (Offline Field Mode)
                  </div>
                  <div className="text-xs text-slate-500">
                    يتيح للمندوبين تعبئة الاستمارات في المناطق النائية ومزامنتها لاحقاً فور توفر الشبكة.
                  </div>
                </div>
              </label>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1.5">
                  رابط Webhook للربط الفوري (اختياري — Power BI / ERP / Google Apps Script)
                </label>
                <input
                  type="url"
                  dir="ltr"
                  placeholder="https://example.com/api/vet-webhook"
                  value={webhookUrl}
                  onChange={(e) => setWebhookUrl(e.target.value)}
                  className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-sky-500"
                />
              </div>
            </div>

            <div className="flex justify-end pt-2">
              <button
                type="submit"
                disabled={saving}
                className="px-5 py-2 bg-sky-600 hover:bg-sky-700 text-white text-sm font-medium rounded-md transition-colors disabled:opacity-60"
              >
                {saving ? 'جارٍ الحفظ...' : 'حفظ التغييرات'}
              </button>
            </div>
          </form>
        )}

        {section === 'sharing' && (
          <div className="space-y-6">
            {/* Users list matching Screenshot 1 */}
            <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
              <div className="px-5 py-3.5 border-b border-slate-200 flex items-center justify-between">
                <div>
                  <h2 className="text-base font-semibold text-slate-900">
                    صلاحيات الوصول ومشاركة المشروع
                  </h2>
                  <p className="text-xs text-slate-500 mt-0.5">
                    إدارة صلاحيات المدراء والمندوبين ومراقبي الجودة على غرار نظام KoboToolbox.
                  </p>
                </div>
                <ShieldCheck className="w-5 h-5 text-sky-600" />
              </div>

              <div className="divide-y divide-slate-200">
                {project.team.map((member) => {
                  const isEditing = editingMemberId === member.id;
                  return (
                    <div
                      key={member.id}
                      className={`px-5 py-3.5 flex items-center justify-between gap-4 transition-colors ${
                        isEditing ? 'bg-sky-50/60' : 'hover:bg-slate-50'
                      }`}
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <span
                          className="w-9 h-9 rounded-full flex items-center justify-center text-white text-sm font-bold shrink-0"
                          style={{ backgroundColor: member.avatarColor }}
                        >
                          {member.fullName.trim().charAt(0)}
                        </span>
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
                            <span>{member.fullName}</span>
                            <span className="text-xs font-mono text-slate-400">
                              ({member.username})
                            </span>
                          </div>
                          <div className="text-xs text-slate-500 truncate mt-0.5">
                            {member.permissions.length > 0
                              ? member.permissions
                                  .map((p) => PERMISSION_LABELS[p])
                                  .join(' · ')
                              : 'بدون صلاحيات محددة'}
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        <button
                          type="button"
                          onClick={() => handleSelectMemberForEdit(member)}
                          title="تعديل الصلاحيات"
                          className={`p-2 rounded-md border transition-colors ${
                            isEditing
                              ? 'border-sky-400 bg-sky-100 text-sky-700'
                              : 'border-slate-200 text-slate-600 hover:bg-slate-100'
                          }`}
                        >
                          <Edit2 className="w-4 h-4" />
                        </button>
                        {project.team.length > 1 && (
                          <button
                            type="button"
                            onClick={() => handleRemoveMember(member.id)}
                            title="إزالة المستخدم"
                            className="p-2 rounded-md border border-slate-200 text-slate-500 hover:text-rose-600 hover:border-rose-200 transition-colors"
                          >
                            <X className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Granular Permission Checkboxes matching Screenshot 1 */}
              {editingMember && (
                <div className="p-5 bg-slate-50/70 border-t border-slate-200 space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="text-sm font-semibold text-slate-900">
                      تعديل صلاحيات: <span className="text-sky-700">{editingMember.fullName}</span>
                    </div>
                    <span className="text-xs text-slate-500">{editingMember.roleTitle}</span>
                  </div>

                  <div className="space-y-2.5 bg-white border border-slate-200 rounded-md p-4">
                    {PERMISSION_TREE.map((node) => (
                      <div key={node.key} className="space-y-2">
                        <label className="flex items-center gap-2.5 cursor-pointer text-sm text-slate-800 font-medium">
                          <input
                            type="checkbox"
                            checked={draftPermissions.includes(node.key)}
                            onChange={() => togglePermission(node.key)}
                            className="w-4 h-4 rounded border-slate-300 text-sky-600 focus:ring-sky-500"
                          />
                          <span>{PERMISSION_LABELS[node.key]}</span>
                        </label>
                        {node.children && (
                          <div className="mr-7 space-y-1.5 border-r border-slate-200 pr-3">
                            {node.children.map((childKey) => (
                              <label
                                key={childKey}
                                className="flex items-center gap-2.5 cursor-pointer text-xs text-slate-600"
                              >
                                <input
                                  type="checkbox"
                                  checked={draftPermissions.includes(childKey)}
                                  onChange={() => togglePermission(childKey)}
                                  className="w-4 h-4 rounded border-slate-300 text-sky-600 focus:ring-sky-500"
                                />
                                <span>{PERMISSION_LABELS[childKey]}</span>
                              </label>
                            ))}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>

                  <div>
                    <button
                      type="button"
                      onClick={handleUpdatePermissions}
                      disabled={saving}
                      className="px-4 py-2 bg-sky-600 hover:bg-sky-700 text-white text-sm font-medium rounded-md transition-colors"
                    >
                      {saving ? 'جارٍ التحديث...' : 'تحديث الصلاحيات'}
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Add new team member */}
            <form
              onSubmit={handleAddMember}
              className="bg-white border border-slate-200 rounded-lg p-5 space-y-4"
            >
              <h3 className="text-sm font-semibold text-slate-900 flex items-center gap-2">
                <UserPlus className="w-4 h-4 text-sky-600" />
                إضافة مستخدم أو مندوب جديد للمشروع
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <input
                  type="text"
                  required
                  placeholder="الاسم الكامل (مثال: د. ريم الشمري)"
                  value={newFullName}
                  onChange={(e) => setNewFullName(e.target.value)}
                  className="border border-slate-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500"
                />
                <input
                  type="text"
                  required
                  dir="ltr"
                  placeholder="username (e.g. r.shammari)"
                  value={newUsername}
                  onChange={(e) => setNewUsername(e.target.value)}
                  className="border border-slate-300 rounded-md px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-sky-500"
                />
                <input
                  type="text"
                  placeholder="المسمى الوظيفي (مثال: طبيبة دعم فني)"
                  value={newRoleTitle}
                  onChange={(e) => setNewRoleTitle(e.target.value)}
                  className="border border-slate-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500"
                />
              </div>
              <button
                type="submit"
                disabled={saving}
                className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white text-xs font-medium rounded-md inline-flex items-center gap-1.5"
              >
                <Plus className="w-3.5 h-3.5" />
                إضافة ومنح صلاحية الجمع
              </button>
            </form>
          </div>
        )}

        {section === 'audit' && (
          <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
            <div className="px-5 py-3.5 border-b border-slate-200">
              <h2 className="text-base font-semibold text-slate-900">سجل التعديلات والشفافية</h2>
              <p className="text-xs text-slate-500 mt-0.5">
                توثيق زمني لجميع التغييرات على النموذج، الصلاحيات، واعتمادات البيانات.
              </p>
            </div>
            {project.auditLog.length === 0 ? (
              <div className="p-8 text-center text-sm text-slate-500">
                لا توجد تعديلات مسجلة في السجل بعد.
              </div>
            ) : (
              <div className="divide-y divide-slate-100">
                {project.auditLog.map((entry) => (
                  <div key={entry.id} className="px-5 py-3.5 flex items-start justify-between gap-4">
                    <div>
                      <div className="text-sm font-semibold text-slate-900">{entry.action}</div>
                      {entry.details && (
                        <div className="text-xs text-slate-600 mt-1">{entry.details}</div>
                      )}
                      <div className="text-xs text-slate-400 mt-1">بواسطة: {entry.actor}</div>
                    </div>
                    <div className="text-xs text-slate-500 tabular-nums whitespace-nowrap shrink-0">
                      {formatArabicDateTime(entry.timestamp)}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
