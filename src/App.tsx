import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  BarChart3,
  Check,
  Copy,
  Database,
  ExternalLink,
  FileSpreadsheet,
  FolderOpen,
  Layers,
  Plus,
  RefreshCw,
  Search,
  Trash2,
  X,
} from 'lucide-react';
import { DataTab, type DataSubTab } from './components/DataTab';
import { FormBuilderTab } from './components/FormBuilderTab';
import { SettingsTab } from './components/SettingsTab';
import { SummaryTab } from './components/SummaryTab';
import { WebFormCollector } from './components/WebFormCollector';
import { VETERINARY_LIBRARY_BLOCKS } from './data/seedData';
import {
  QUESTION_TYPES,
  type FormQuestion,
  type FormSubmission,
  type Project,
  type ProjectCategory,
  type ProjectStatus,
  type ProjectSummary,
  type ValidationStatus,
} from './types/kobo';
import {
  bulkActionSubmissions,
  createProject,
  deleteProject,
  exportProjectToCsv,
  fetchProject,
  fetchProjects,
  fetchSubmissions,
  getOfflineQueue,
  syncOfflineQueueForProject,
  updateProject,
  updateSubmission,
} from './utils/api';
import { formatArabicDate } from './utils/skipLogic';

type TopSection = 'projects' | 'library' | 'collect-hub' | 'integrations';
type ProjectTab = 'summary' | 'form' | 'data' | 'settings';

const STATUS_TEXT: Record<ProjectStatus, { label: string; color: string }> = {
  deployed: { label: 'منشور', color: 'text-emerald-700' },
  draft: { label: 'مسودة', color: 'text-amber-700' },
  archived: { label: 'مؤرشف', color: 'text-slate-500' },
};

export default function App() {
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [topSection, setTopSection] = useState<TopSection>('projects');
  const [statusFilter, setStatusFilter] = useState<'all' | ProjectStatus>('all');
  const [searchTerm, setSearchTerm] = useState('');

  // Selected project workspace state
  const [activeProject, setActiveProject] = useState<Project | null>(null);
  const [activeSubmissions, setActiveSubmissions] = useState<FormSubmission[]>([]);
  const [projectTab, setProjectTab] = useState<ProjectTab>('summary');
  const [dataSubTab, setDataSubTab] = useState<DataSubTab>('reports');
  const [settingsSection, setSettingsSection] = useState<'general' | 'sharing' | 'audit'>('general');

  // Collector mode state
  const [collectorMode, setCollectorMode] = useState<{
    project: Project;
    previewOnly: boolean;
  } | null>(null);

  // Create Project Modal
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newSector, setNewSector] = useState('شركة أكديما — إنتاج وتوزيع الأدوية البيطرية');
  const [newCountry, setNewCountry] = useState('الجمهورية العربية السورية');
  const [newDescription, setNewDescription] = useState('');
  const [newCategory, setNewCategory] = useState<ProjectCategory>('visits');
  const [creating, setCreating] = useState(false);

  // Offline queue count
  const [offlineQueueCount, setOfflineQueueCount] = useState(() => getOfflineQueue().length);
  const [syncingGlobal, setSyncingGlobal] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const loadProjects = useCallback(async () => {
    try {
      setError('');
      const list = await fetchProjects();
      setProjects(list);
    } catch {
      setError('تعذر الاتصال بخادم البيانات. يرجى إعادة المحاولة.');
    } finally {
      setLoading(false);
    }
  }, []);

  const openProjectWorkspace = useCallback(
    async (projectId: string, initialTab: ProjectTab = 'summary') => {
      try {
        const [proj, subs] = await Promise.all([
          fetchProject(projectId),
          fetchSubmissions(projectId),
        ]);
        setActiveProject(proj);
        setActiveSubmissions(subs);
        setProjectTab(initialTab);
      } catch {
        setError('تعذر فتح المشروع المطلوب.');
      }
    },
    []
  );

  // Check hash route (#/collect/:id) on load
  useEffect(() => {
    loadProjects().then(() => {
      const hash = window.location.hash;
      const match = hash.match(/^#\/collect\/([^/]+)/);
      if (match && match[1]) {
        fetchProject(match[1])
          .then((proj) => {
            setCollectorMode({ project: proj, previewOnly: false });
          })
          .catch(() => {});
      }
    });
  }, [loadProjects]);

  const handleGlobalSync = async () => {
    setSyncingGlobal(true);
    try {
      const { syncedCount, remaining } = await syncOfflineQueueForProject();
      setOfflineQueueCount(remaining.length);
      if (syncedCount > 0) {
        await loadProjects();
        if (activeProject) {
          const subs = await fetchSubmissions(activeProject.id);
          setActiveSubmissions(subs);
        }
      }
    } finally {
      setSyncingGlobal(false);
    }
  };

  const handleCreateProject = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitle.trim()) return;
    setCreating(true);
    try {
      const starterBlock =
        newCategory === 'visits'
          ? VETERINARY_LIBRARY_BLOCKS[0]
          : newCategory === 'market'
            ? VETERINARY_LIBRARY_BLOCKS[1]
            : newCategory === 'distributors'
              ? VETERINARY_LIBRARY_BLOCKS[2]
              : null;

      const starterQuestions: FormQuestion[] = starterBlock
        ? starterBlock.questions.map((q, i) => ({
            ...JSON.parse(JSON.stringify(q)),
            id: `q_init_${Date.now()}_${i}`,
          }))
        : [];

      const created = await createProject({
        title: newTitle.trim(),
        sector: newSector.trim(),
        country: newCountry.trim(),
        description: newDescription.trim(),
        category: newCategory,
        status: 'draft',
        questions: starterQuestions,
      });

      setShowCreateModal(false);
      setNewTitle('');
      setNewDescription('');
      await loadProjects();
      await openProjectWorkspace(created.id, 'form');
    } finally {
      setCreating(false);
    }
  };

  const handleDeleteProject = async (id: string) => {
    await deleteProject(id);
    if (activeProject?.id === id) {
      setActiveProject(null);
    }
    await loadProjects();
  };

  const handleSaveQuestions = async (questions: FormQuestion[], deployNow = false) => {
    if (!activeProject) return;
    const updated = await updateProject(activeProject.id, {
      questions,
      status: deployNow ? 'deployed' : activeProject.status,
      auditAction: deployNow ? 'نشر تحديثات النموذج' : 'حفظ تعديلات الأسئلة',
      auditDetails: `عدد الأسئلة الحالي: ${questions.length}`,
    });
    setActiveProject(updated);
    await loadProjects();
  };

  const handleSaveProjectSettings = async (
    updates: Partial<Project> & { auditAction?: string; auditDetails?: string }
  ) => {
    if (!activeProject) return;
    const updated = await updateProject(activeProject.id, updates);
    setActiveProject(updated);
    await loadProjects();
  };

  const handleUpdateSubmission = async (
    subId: string,
    payload: Partial<FormSubmission>
  ) => {
    if (!activeProject) return;
    const updated = await updateSubmission(activeProject.id, subId, payload);
    setActiveSubmissions((prev) => prev.map((s) => (s.id === subId ? updated : s)));
    await loadProjects();
  };

  const handleBulkAction = async (
    ids: string[],
    action: 'validate' | 'delete',
    status?: ValidationStatus
  ) => {
    if (!activeProject) return;
    await bulkActionSubmissions(activeProject.id, ids, action, status);
    const fresh = await fetchSubmissions(activeProject.id);
    setActiveSubmissions(fresh);
    await loadProjects();
  };

  const filteredProjects = useMemo(() => {
    return projects.filter((p) => {
      if (statusFilter !== 'all' && p.status !== statusFilter) return false;
      if (!searchTerm.trim()) return true;
      const needle = searchTerm.toLowerCase();
      return (
        p.title.toLowerCase().includes(needle) ||
        p.sector.toLowerCase().includes(needle) ||
        p.description.toLowerCase().includes(needle)
      );
    });
  }, [projects, statusFilter, searchTerm]);

  const globalMetrics = useMemo(() => {
    const totalProjects = projects.length;
    const totalSubmissions = projects.reduce((sum, p) => sum + p.submissionCount, 0);
    const totalApproved = projects.reduce((sum, p) => sum + p.approvedCount, 0);
    const approvalRate =
      totalSubmissions > 0 ? Math.round((totalApproved / totalSubmissions) * 100) : 0;
    return { totalProjects, totalSubmissions, totalApproved, approvalRate };
  }, [projects]);

  // If in Web Form Collector view (Enketo mode)
  if (collectorMode) {
    return (
      <WebFormCollector
        project={collectorMode.project}
        previewOnly={collectorMode.previewOnly}
        onClose={() => {
          setCollectorMode(null);
          setOfflineQueueCount(getOfflineQueue().length);
          if (window.location.hash.startsWith('#/collect/')) {
            window.location.hash = '';
          }
        }}
        onSubmitted={async () => {
          setOfflineQueueCount(getOfflineQueue().length);
          await loadProjects();
          if (activeProject && activeProject.id === collectorMode.project.id) {
            const subs = await fetchSubmissions(activeProject.id);
            setActiveSubmissions(subs);
          }
        }}
      />
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 flex flex-col">
      {/* Strict 3-Zone Top Bar Contract */}
      <header className="bg-white border-b border-slate-200 px-6 py-3.5 flex items-center justify-between gap-8 no-print">
        {/* Zone 1: Single-line Brand Title */}
        <button
          type="button"
          onClick={() => {
            setActiveProject(null);
            setTopSection('projects');
          }}
          className="flex items-center gap-2.5 text-lg font-bold tracking-tight text-slate-900 whitespace-nowrap shrink-0 focus:outline-none"
        >
          <span className="w-7 h-7 rounded bg-sky-600 text-white flex items-center justify-center">
            <Database className="w-4 h-4" />
          </span>
          <span>شركة أكديما</span>
        </button>

        {/* Zone 2: 4 concise single-line nav links */}
        <nav className="hidden md:flex items-center gap-6 text-sm font-medium text-slate-600">
          <button
            type="button"
            onClick={() => {
              setActiveProject(null);
              setTopSection('projects');
            }}
            className={`whitespace-nowrap shrink-0 pb-0.5 transition-colors ${
              !activeProject && topSection === 'projects'
                ? 'text-sky-700 border-b-2 border-sky-600 font-semibold'
                : 'hover:text-slate-900'
            }`}
          >
            المشاريع
          </button>
          <button
            type="button"
            onClick={() => {
              setActiveProject(null);
              setTopSection('library');
            }}
            className={`whitespace-nowrap shrink-0 pb-0.5 transition-colors ${
              !activeProject && topSection === 'library'
                ? 'text-sky-700 border-b-2 border-sky-600 font-semibold'
                : 'hover:text-slate-900'
            }`}
          >
            مكتبة الأسئلة
          </button>
          <button
            type="button"
            onClick={() => {
              setActiveProject(null);
              setTopSection('collect-hub');
            }}
            className={`whitespace-nowrap shrink-0 pb-0.5 transition-colors ${
              !activeProject && topSection === 'collect-hub'
                ? 'text-sky-700 border-b-2 border-sky-600 font-semibold'
                : 'hover:text-slate-900'
            }`}
          >
            تعبئة استمارة
          </button>
          <button
            type="button"
            onClick={() => {
              setActiveProject(null);
              setTopSection('integrations');
            }}
            className={`whitespace-nowrap shrink-0 pb-0.5 transition-colors ${
              !activeProject && topSection === 'integrations'
                ? 'text-sky-700 border-b-2 border-sky-600 font-semibold'
                : 'hover:text-slate-900'
            }`}
          >
            التكامل والربط
          </button>
        </nav>

        {/* Zone 3: 1 Primary CTA */}
        <div className="flex items-center gap-3 shrink-0">
          <button
            type="button"
            onClick={() => setShowCreateModal(true)}
            className="px-4 py-2 text-xs font-semibold text-white bg-sky-600 hover:bg-sky-700 rounded-md inline-flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0"
          >
            <Plus className="w-4 h-4" />
            مشروع جديد
          </button>
        </div>
      </header>

      {/* Mobile Nav Strip */}
      <div className="md:hidden bg-white border-b border-slate-200 px-4 py-2 flex items-center gap-4 overflow-x-auto text-xs font-medium text-slate-600 no-print">
        {[
          { id: 'projects' as const, label: 'المشاريع' },
          { id: 'library' as const, label: 'مكتبة الأسئلة' },
          { id: 'collect-hub' as const, label: 'تعبئة استمارة' },
          { id: 'integrations' as const, label: 'التكامل والربط' },
        ].map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => {
              setActiveProject(null);
              setTopSection(item.id);
            }}
            className={`whitespace-nowrap shrink-0 py-1 ${
              !activeProject && topSection === item.id
                ? 'text-sky-700 font-semibold border-b-2 border-sky-600'
                : ''
            }`}
          >
            {item.label}
          </button>
        ))}
      </div>

      {/* Offline Pending Queue Banner (Only when items exist locally) */}
      {offlineQueueCount > 0 && (
        <div className="bg-amber-50 border-b border-amber-200 px-6 py-2.5 flex flex-wrap items-center justify-between gap-3 no-print">
          <span className="text-xs font-medium text-amber-900 tabular-nums">
            توجد {offlineQueueCount} استمارة ميدانية محفوظة محلياً بانتظار المزامنة مع الخادم.
          </span>
          <button
            type="button"
            onClick={handleGlobalSync}
            disabled={syncingGlobal}
            className="px-3 py-1 bg-amber-600 hover:bg-amber-700 text-white rounded text-xs font-semibold inline-flex items-center gap-1.5"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${syncingGlobal ? 'animate-spin' : ''}`} />
            {syncingGlobal ? 'جارٍ المزامنة...' : 'مزامنة الكل الآن'}
          </button>
        </div>
      )}

      {/* PROJECT WORKSPACE VIEW (Summary / Form / Data / Settings matching Screenshot 4) */}
      {activeProject ? (
        <div className="flex-1 flex flex-col">
          {/* KoboToolbox Project Navigation Strip */}
          <div className="bg-white border-b border-slate-200 px-6 pt-3 no-print">
            <div className="max-w-7xl mx-auto flex flex-wrap items-center justify-between gap-4">
              <div className="flex items-center gap-3 min-w-0 pb-3 sm:pb-0">
                <h1 className="text-base font-bold text-slate-900 truncate">
                  {activeProject.title}
                </h1>
                <span
                  className={`text-xs font-medium whitespace-nowrap ${
                    STATUS_TEXT[activeProject.status].color
                  }`}
                >
                  · {STATUS_TEXT[activeProject.status].label}
                </span>
              </div>

              {/* 4 Main KoboToolbox Tabs */}
              <div className="flex items-center gap-1">
                {[
                  { id: 'summary' as const, label: 'الملخص' },
                  { id: 'form' as const, label: 'تصميم النموذج' },
                  { id: 'data' as const, label: 'البيانات' },
                  { id: 'settings' as const, label: 'الإعدادات' },
                ].map((tab) => {
                  const active = projectTab === tab.id;
                  return (
                    <button
                      key={tab.id}
                      type="button"
                      onClick={() => setProjectTab(tab.id)}
                      className={`px-4 py-3 text-sm font-semibold border-b-2 transition-colors whitespace-nowrap shrink-0 ${
                        active
                          ? 'border-sky-600 text-sky-700'
                          : 'border-transparent text-slate-500 hover:text-slate-900'
                      }`}
                    >
                      {tab.label}
                    </button>
                  );
                })}
              </div>

              <button
                type="button"
                onClick={() => setActiveProject(null)}
                title="العودة إلى قائمة المشاريع"
                className="p-2 text-slate-400 hover:text-slate-700 rounded-md"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>

          <main className="flex-1 max-w-7xl w-full mx-auto px-6 py-6">
            {projectTab === 'summary' && (
              <SummaryTab
                project={activeProject}
                submissions={activeSubmissions}
                onNavigateDataTab={(subTab) => {
                  setDataSubTab(subTab);
                  setProjectTab('data');
                }}
                onOpenCollector={(previewOnly) =>
                  setCollectorMode({ project: activeProject, previewOnly })
                }
                onNavigateSettingsSharing={() => {
                  setSettingsSection('sharing');
                  setProjectTab('settings');
                }}
              />
            )}

            {projectTab === 'form' && (
              <FormBuilderTab
                project={activeProject}
                onSaveQuestions={handleSaveQuestions}
                onOpenPreview={() =>
                  setCollectorMode({ project: activeProject, previewOnly: true })
                }
              />
            )}

            {projectTab === 'data' && (
              <DataTab
                project={activeProject}
                submissions={activeSubmissions}
                activeSubTab={dataSubTab}
                onChangeSubTab={setDataSubTab}
                onUpdateSubmission={handleUpdateSubmission}
                onBulkAction={handleBulkAction}
              />
            )}

            {projectTab === 'settings' && (
              <SettingsTab
                project={activeProject}
                initialSection={settingsSection}
                onSaveProject={handleSaveProjectSettings}
              />
            )}
          </main>
        </div>
      ) : (
        /* TOP-LEVEL VIEWS */
        <main className="flex-1 max-w-7xl w-full mx-auto px-6 py-6 space-y-6">
          {error && (
            <div className="bg-rose-50 border border-rose-200 text-rose-800 px-4 py-3 rounded-md text-xs font-medium">
              {error}
            </div>
          )}

          {/* 1. PROJECTS HUB */}
          {topSection === 'projects' && (
            <>
              <div className="flex flex-wrap items-end justify-between gap-4">
                <div>
                  <h1 className="text-2xl font-bold text-slate-900">
                    شركة أكديما لإنتاج وتوزيع الأدوية البيطرية — سوريا
                  </h1>
                  <p className="text-sm text-slate-600 mt-1">
                    منصة جمع البيانات الميدانية لإدارة زيارات المندوبين، دراسة السوق، جرد الوكلاء، وقياس رضا الأطباء والصيدليات في المحافظات السورية.
                  </p>
                </div>
              </div>

              {/* 4 KPI Strip */}
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="bg-white border border-slate-200 rounded-lg p-4">
                  <div className="text-xs text-slate-500">المشاريع والاستمارات</div>
                  <div className="text-2xl font-bold text-slate-900 mt-1 tabular-nums">
                    {globalMetrics.totalProjects}
                  </div>
                </div>
                <div className="bg-white border border-slate-200 rounded-lg p-4">
                  <div className="text-xs text-slate-500">إجمالي الاستجابات الميدانية</div>
                  <div className="text-2xl font-bold text-sky-600 mt-1 tabular-nums">
                    {globalMetrics.totalSubmissions}
                  </div>
                </div>
                <div className="bg-white border border-slate-200 rounded-lg p-4">
                  <div className="text-xs text-slate-500">الاستجابات المعتمدة</div>
                  <div className="text-2xl font-bold text-emerald-600 mt-1 tabular-nums">
                    {globalMetrics.totalApproved}
                  </div>
                </div>
                <div className="bg-white border border-slate-200 rounded-lg p-4">
                  <div className="text-xs text-slate-500">نسبة الاعتماد والجودة</div>
                  <div className="text-2xl font-bold text-slate-900 mt-1 tabular-nums">
                    {globalMetrics.approvalRate}%
                  </div>
                </div>
              </div>

              {/* Projects Table Container */}
              <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
                <div className="px-4 py-3 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-md">
                    {[
                      { id: 'all' as const, label: 'الكل' },
                      { id: 'deployed' as const, label: 'منشور' },
                      { id: 'draft' as const, label: 'مسودة' },
                      { id: 'archived' as const, label: 'مؤرشف' },
                    ].map((f) => (
                      <button
                        key={f.id}
                        type="button"
                        onClick={() => setStatusFilter(f.id)}
                        className={`px-3 py-1 text-xs font-medium rounded transition-colors whitespace-nowrap shrink-0 ${
                          statusFilter === f.id
                            ? 'bg-white text-slate-900 shadow-xs'
                            : 'text-slate-600 hover:text-slate-900'
                        }`}
                      >
                        {f.label}
                      </button>
                    ))}
                  </div>

                  <div className="relative">
                    <Search className="w-3.5 h-3.5 text-slate-400 absolute right-3 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      placeholder="ابحث باسم المشروع أو القطاع..."
                      className="pr-8 pl-3 py-1.5 text-xs border border-slate-300 rounded-md w-64 focus:outline-none focus:ring-2 focus:ring-sky-500"
                    />
                  </div>
                </div>

                {loading ? (
                  <div className="p-8 space-y-3">
                    {[1, 2, 3, 4].map((i) => (
                      <div key={i} className="h-10 bg-slate-100 rounded animate-pulse" />
                    ))}
                  </div>
                ) : filteredProjects.length === 0 ? (
                  <div className="p-12 text-center space-y-3">
                    <FolderOpen className="w-8 h-8 text-slate-300 mx-auto" />
                    <div className="text-sm font-medium text-slate-600">
                      لا توجد مشاريع مطابقة لخيارات البحث الحالية.
                    </div>
                    <button
                      type="button"
                      onClick={() => setShowCreateModal(true)}
                      className="px-4 py-2 bg-sky-600 text-white rounded-md text-xs font-semibold"
                    >
                      إنشاء مشروع جديد
                    </button>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-right border-collapse text-sm">
                      <thead>
                        <tr className="bg-slate-50 border-b border-slate-200 text-xs font-semibold text-slate-600">
                          <th className="px-5 py-3">اسم المشروع</th>
                          <th className="px-4 py-3 whitespace-nowrap">الحالة</th>
                          <th className="px-4 py-3 whitespace-nowrap">الأسئلة</th>
                          <th className="px-4 py-3 whitespace-nowrap">الاستجابات</th>
                          <th className="px-4 py-3 whitespace-nowrap">آخر تحديث</th>
                          <th className="px-4 py-3 whitespace-nowrap">إجراءات</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-200">
                        {filteredProjects.map((proj) => (
                          <tr
                            key={proj.id}
                            className="hover:bg-sky-50/30 transition-colors"
                          >
                            <td className="px-5 py-3.5">
                              <button
                                type="button"
                                onClick={() => openProjectWorkspace(proj.id, 'summary')}
                                className="text-right group"
                              >
                                <div className="font-semibold text-slate-900 group-hover:text-sky-700 transition-colors">
                                  {proj.title}
                                </div>
                                <div className="text-xs text-slate-500 mt-0.5">
                                  {proj.sector} · الإصدار v{proj.version}
                                </div>
                              </button>
                            </td>
                            <td className="px-4 py-3.5 whitespace-nowrap">
                              <span
                                className={`text-xs font-semibold ${STATUS_TEXT[proj.status].color}`}
                              >
                                {STATUS_TEXT[proj.status].label}
                              </span>
                            </td>
                            <td className="px-4 py-3.5 text-xs text-slate-700 tabular-nums whitespace-nowrap">
                              {proj.questions.length}
                            </td>
                            <td className="px-4 py-3.5 text-xs font-semibold text-sky-700 tabular-nums whitespace-nowrap">
                              {proj.submissionCount}
                            </td>
                            <td className="px-4 py-3.5 text-xs text-slate-500 tabular-nums whitespace-nowrap">
                              {formatArabicDate(proj.updatedAt)}
                            </td>
                            <td className="px-4 py-3.5 whitespace-nowrap">
                              <div className="flex items-center gap-2">
                                <button
                                  type="button"
                                  onClick={() => openProjectWorkspace(proj.id, 'summary')}
                                  className="px-2.5 py-1 border border-slate-200 hover:border-sky-400 rounded text-xs font-medium text-slate-700 hover:text-sky-700 bg-white"
                                >
                                  فتح المشروع
                                </button>
                                <button
                                  type="button"
                                  onClick={() =>
                                    setCollectorMode({ project: proj, previewOnly: false })
                                  }
                                  className="px-2.5 py-1 bg-sky-50 hover:bg-sky-100 text-sky-700 rounded text-xs font-medium inline-flex items-center gap-1"
                                >
                                  <ExternalLink className="w-3 h-3" />
                                  تعبئة
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleDeleteProject(proj.id)}
                                  title="حذف المشروع"
                                  className="p-1.5 text-slate-400 hover:text-rose-600 rounded"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </>
          )}

          {/* 2. QUESTION LIBRARY & 26 TYPES */}
          {topSection === 'library' && (
            <div className="space-y-6">
              <div>
                <h1 className="text-2xl font-bold text-slate-900">
                  مكتبة الأسئلة البيطرية وأنواع الحقول المدعومة
                </h1>
                <p className="text-sm text-slate-600 mt-1">
                  يدعم النظام 26 نوعاً من الأسئلة القياسية بالإضافة إلى حزم أسئلة جاهزة لشركات الأدوية البيطرية.
                </p>
              </div>

              <div className="bg-white border border-slate-200 rounded-lg p-5 space-y-4">
                <h2 className="text-sm font-semibold text-slate-900 flex items-center gap-2">
                  <Layers className="w-4 h-4 text-sky-600" />
                  حزم الأسئلة الجاهزة لشركة الأدوية البيطرية
                </h2>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {VETERINARY_LIBRARY_BLOCKS.map((block) => (
                    <div
                      key={block.id}
                      className="border border-slate-200 rounded-md p-4 flex flex-col justify-between gap-3"
                    >
                      <div>
                        <div className="text-sm font-semibold text-slate-900">{block.title}</div>
                        <div className="text-xs text-slate-500 mt-0.5 tabular-nums">
                          {block.category} · {block.questions.length} أسئلة
                        </div>
                        <p className="text-xs text-slate-600 mt-2">{block.description}</p>
                      </div>
                      <div className="text-[11px] text-slate-500 border-t border-slate-100 pt-2">
                        {block.questions.map((q) => q.label).join(' · ')}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="bg-white border border-slate-200 rounded-lg p-5 space-y-4">
                <h2 className="text-sm font-semibold text-slate-900">
                  جميع أنواع الأسئلة المدعومة (26 نوعاً)
                </h2>
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                  {QUESTION_TYPES.map((qt) => (
                    <div
                      key={qt.type}
                      className="border border-slate-200 rounded-md p-3 flex items-start gap-2.5"
                    >
                      <span className="w-9 h-7 rounded bg-slate-100 text-slate-700 text-xs font-mono font-semibold flex items-center justify-center shrink-0">
                        {qt.badge}
                      </span>
                      <div className="min-w-0">
                        <div className="text-xs font-semibold text-slate-900">{qt.labelAr}</div>
                        <div className="text-[11px] text-slate-500 mt-0.5">{qt.descriptionAr}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* 3. COLLECT HUB (Quick launch any deployed survey for field reps) */}
          {topSection === 'collect-hub' && (
            <div className="space-y-5">
              <div>
                <h1 className="text-2xl font-bold text-slate-900">
                  مركز جمع البيانات الميدانية (الهواتف والكمبيوتر)
                </h1>
                <p className="text-sm text-slate-600 mt-1">
                  اختر الاستمارة المطلوبة لتعبئتها ميدانياً مباشرة أو انسخ رابطها لإرساله للمندوبين والأطباء.
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {projects.map((proj) => {
                  const link = `${window.location.origin}/#/collect/${proj.id}`;
                  return (
                    <div
                      key={proj.id}
                      className="bg-white border border-slate-200 rounded-lg p-5 flex flex-col justify-between gap-4"
                    >
                      <div>
                        <div className="text-xs text-slate-500">
                          {proj.sector} · {proj.questions.length} سؤالاً
                        </div>
                        <h2 className="text-base font-bold text-slate-900 mt-1">{proj.title}</h2>
                        <p className="text-xs text-slate-600 mt-1.5 leading-relaxed">
                          {proj.description}
                        </p>
                      </div>

                      <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-slate-100">
                        <button
                          type="button"
                          onClick={() =>
                            setCollectorMode({ project: proj, previewOnly: false })
                          }
                          className="px-4 py-2 bg-sky-600 hover:bg-sky-700 text-white rounded-md text-xs font-semibold inline-flex items-center gap-1.5"
                        >
                          <ExternalLink className="w-3.5 h-3.5" />
                          فتح الاستمارة للتعبئة
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            navigator.clipboard.writeText(link).catch(() => {});
                            setCopiedId(proj.id);
                            setTimeout(() => setCopiedId(null), 2000);
                          }}
                          className="px-3 py-2 border border-slate-200 hover:bg-slate-50 rounded-md text-xs font-medium text-slate-700 inline-flex items-center gap-1.5"
                        >
                          {copiedId === proj.id ? (
                            <Check className="w-3.5 h-3.5 text-emerald-600" />
                          ) : (
                            <Copy className="w-3.5 h-3.5" />
                          )}
                          {copiedId === proj.id ? 'تم نسخ الرابط' : 'نسخ رابط المشاركة'}
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* 4. INTEGRATIONS HUB */}
          {topSection === 'integrations' && (
            <div className="space-y-5">
              <div>
                <h1 className="text-2xl font-bold text-slate-900">
                  الربط مع Power BI و Google Sheets وتصدير التقارير
                </h1>
                <p className="text-sm text-slate-600 mt-1">
                  نقاط ربط JSON و CSV حية لكل استمارة لضمان تدفق البيانات مباشرة نحو لوحات التحليل الإداري.
                </p>
              </div>

              <div className="bg-white border border-slate-200 rounded-lg divide-y divide-slate-200">
                {projects.map((proj) => {
                  const jsonUrl = `${window.location.origin}/api/projects/${proj.id}/export/json`;
                  const csvUrl = `${window.location.origin}/api/projects/${proj.id}/export/csv`;
                  return (
                    <div key={proj.id} className="p-5 space-y-3">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div>
                          <h3 className="text-sm font-bold text-slate-900">{proj.title}</h3>
                          <div className="text-xs text-slate-500 tabular-nums">
                            {proj.submissionCount} استجابة مسجلة · الإصدار v{proj.version}
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={async () => {
                              const subs = await fetchSubmissions(proj.id);
                              exportProjectToCsv(proj, subs);
                            }}
                            className="px-3 py-1.5 border border-slate-200 rounded text-xs font-medium text-slate-700 hover:bg-slate-50 inline-flex items-center gap-1"
                          >
                            <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-600" />
                            تنزيل CSV
                          </button>
                          <button
                            type="button"
                            onClick={() => openProjectWorkspace(proj.id, 'data')}
                            className="px-3 py-1.5 bg-sky-50 text-sky-700 rounded text-xs font-medium inline-flex items-center gap-1"
                          >
                            <BarChart3 className="w-3.5 h-3.5" />
                            التقارير والبيانات
                          </button>
                        </div>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
                        <div>
                          <div className="text-slate-500 mb-1">Power BI JSON Endpoint</div>
                          <input
                            type="text"
                            readOnly
                            dir="ltr"
                            value={jsonUrl}
                            className="w-full bg-slate-50 border border-slate-200 rounded px-2.5 py-1.5 font-mono text-slate-700"
                          />
                        </div>
                        <div>
                          <div className="text-slate-500 mb-1">Google Sheets Formula</div>
                          <input
                            type="text"
                            readOnly
                            dir="ltr"
                            value={`=IMPORTDATA("${csvUrl}")`}
                            className="w-full bg-slate-50 border border-slate-200 rounded px-2.5 py-1.5 font-mono text-slate-700"
                          />
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </main>
      )}

      {/* Create New Project Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 flex items-center justify-center p-4">
          <form
            onSubmit={handleCreateProject}
            className="bg-white border border-slate-200 rounded-lg max-w-lg w-full overflow-hidden"
          >
            <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between">
              <h2 className="text-base font-bold text-slate-900">إنشاء مشروع جمع بيانات جديد</h2>
              <button
                type="button"
                onClick={() => setShowCreateModal(false)}
                className="text-slate-400 hover:text-slate-700 p-1"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-5 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  اسم المشروع / الاستمارة *
                </label>
                <input
                  type="text"
                  required
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  placeholder="مثال: مسح احتياجات مزارع الأبقار في المنطقة الشرقية"
                  className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    القالب المبدئي
                  </label>
                  <select
                    value={newCategory}
                    onChange={(e) => setNewCategory(e.target.value as ProjectCategory)}
                    className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm bg-white"
                  >
                    <option value="visits">استبيان زيارة العملاء</option>
                    <option value="market">دراسة السوق والمنافسين</option>
                    <option value="reps">تقييم أداء المندوبين</option>
                    <option value="distributors">متابعة الوكلاء والمخزون</option>
                    <option value="satisfaction">قياس رضا العملاء</option>
                    <option value="custom">نموذج فارغ مخصص</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    الدولة / النطاق
                  </label>
                  <input
                    type="text"
                    value={newCountry}
                    onChange={(e) => setNewCountry(e.target.value)}
                    className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">القطاع</label>
                <input
                  type="text"
                  value={newSector}
                  onChange={(e) => setNewSector(e.target.value)}
                  className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  وصف مختصر للأهداف
                </label>
                <textarea
                  rows={2}
                  value={newDescription}
                  onChange={(e) => setNewDescription(e.target.value)}
                  placeholder="وصف أهداف الاستبيان ونوع البيانات المراد جمعها..."
                  className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm"
                />
              </div>
            </div>

            <div className="px-5 py-3.5 border-t border-slate-200 bg-slate-50 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowCreateModal(false)}
                className="px-4 py-2 border border-slate-300 bg-white rounded-md text-xs font-medium text-slate-700"
              >
                إلغاء
              </button>
              <button
                type="submit"
                disabled={creating}
                className="px-5 py-2 bg-sky-600 hover:bg-sky-700 text-white rounded-md text-xs font-semibold"
              >
                {creating ? 'جارٍ الإنشاء...' : 'إنشاء والانتقال للتصميم'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
