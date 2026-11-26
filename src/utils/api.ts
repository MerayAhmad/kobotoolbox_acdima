import * as XLSX from 'xlsx';
import { INITIAL_PROJECTS, INITIAL_SUBMISSIONS } from '../data/seedData';
import type {
  FormSubmission,
  Project,
  ProjectSummary,
  ValidationStatus,
} from '../types/kobo';

const OFFLINE_QUEUE_KEY = 'vitafield_offline_queue_v1';
const LOCAL_DB_KEY = 'acdima_local_db_v1';

interface LocalDatabase {
  projects: Project[];
  submissions: FormSubmission[];
}

export interface OfflineQueuedSubmission {
  localId: string;
  projectId: string;
  projectTitle: string;
  submittedAt: string;
  startTime: string;
  endTime: string;
  submittedBy: string;
  answers: Record<string, unknown>;
}

function readLocalDb(): LocalDatabase {
  try {
    const raw = localStorage.getItem(LOCAL_DB_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as LocalDatabase;
      if (Array.isArray(parsed.projects) && Array.isArray(parsed.submissions)) {
        return parsed;
      }
    }
  } catch {
    // ignore corrupted localStorage and reseed
  }
  const seeded: LocalDatabase = {
    projects: JSON.parse(JSON.stringify(INITIAL_PROJECTS)),
    submissions: JSON.parse(JSON.stringify(INITIAL_SUBMISSIONS)),
  };
  try {
    localStorage.setItem(LOCAL_DB_KEY, JSON.stringify(seeded));
  } catch {
    // ignore storage quota errors
  }
  return seeded;
}

function writeLocalDb(db: LocalDatabase): void {
  try {
    localStorage.setItem(LOCAL_DB_KEY, JSON.stringify(db));
  } catch {
    // ignore storage quota errors
  }
}

function toProjectSummary(project: Project, submissions: FormSubmission[]): ProjectSummary {
  const subs = submissions.filter((s) => s.projectId === project.id);
  const approvedCount = subs.filter((s) => s.validationStatus === 'approved').length;
  const latest =
    subs
      .map((s) => s.submittedAt)
      .sort((a, b) => new Date(b).getTime() - new Date(a).getTime())[0] ?? null;

  return {
    ...project,
    submissionCount: subs.length,
    approvedCount,
    latestSubmissionAt: latest,
  };
}

async function tryFetchJson<T>(url: string, options?: RequestInit): Promise<T | null> {
  try {
    const res = await fetch(url, options);
    const contentType = res.headers.get('content-type') || '';
    if (!res.ok || !contentType.includes('application/json')) {
      return null;
    }
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

function extractAttachments(project: Project, answers: Record<string, unknown>) {
  let geoPoint: { lat: number; lng: number; accuracy?: number } | null = null;
  const photos: { questionId: string; url: string; caption?: string }[] = [];

  for (const q of project.questions) {
    const val = answers[q.name];
    if (q.type === 'geopoint' && val && typeof val === 'object' && 'lat' in val && 'lng' in val) {
      geoPoint = val as { lat: number; lng: number; accuracy?: number };
    }
    if (q.type === 'image' && typeof val === 'string' && val.length > 0) {
      photos.push({ questionId: q.id, url: val, caption: q.label });
    }
  }
  return { geoPoint, photos };
}

export async function fetchProjects(): Promise<ProjectSummary[]> {
  const remote = await tryFetchJson<ProjectSummary[]>('/api/projects');
  if (remote) return remote;

  const db = readLocalDb();
  return db.projects.map((p) => toProjectSummary(p, db.submissions));
}

export async function fetchProject(id: string): Promise<ProjectSummary> {
  const remote = await tryFetchJson<ProjectSummary>(`/api/projects/${encodeURIComponent(id)}`);
  if (remote) return remote;

  const db = readLocalDb();
  const project = db.projects.find((p) => p.id === id);
  if (!project) throw new Error('تعذر العثور على المشروع المطلوب');
  return toProjectSummary(project, db.submissions);
}

export async function createProject(payload: Partial<Project>): Promise<ProjectSummary> {
  const remote = await tryFetchJson<ProjectSummary>('/api/projects', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (remote) return remote;

  const db = readLocalDb();
  const now = new Date().toISOString();
  const newProject: Project = {
    id: payload.id || `proj_${Date.now()}`,
    title: payload.title?.trim() || 'مشروع جمع بيانات بيطري جديد',
    sector: payload.sector?.trim() || 'شركة أكديما — إنتاج وتوزيع الأدوية البيطرية',
    country: payload.country?.trim() || 'الجمهورية العربية السورية',
    description: payload.description?.trim() || '',
    status: payload.status || 'draft',
    category: payload.category || 'custom',
    createdAt: now,
    updatedAt: now,
    version: 1,
    allowOffline: payload.allowOffline ?? true,
    webhookUrl: payload.webhookUrl || '',
    questions: Array.isArray(payload.questions) ? payload.questions : [],
    team: [
      {
        id: `tm_${Date.now()}`,
        username: 'admin.acdima',
        fullName: 'مدير النظام — شركة أكديما',
        roleTitle: 'مشرف عام',
        avatarColor: '#0284c7',
        permissions: [
          'view_form',
          'edit_form',
          'view_submissions',
          'add_submissions',
          'edit_submissions',
          'validate_submissions',
          'delete_submissions',
          'manage_project',
        ],
      },
    ],
    auditLog: [
      {
        id: `al_${Date.now()}`,
        timestamp: now,
        actor: 'مدير النظام',
        action: 'إنشاء المشروع',
        details: `تم إنشاء مشروع "${payload.title?.trim() || 'مشروع جديد'}" بنجاح.`,
      },
    ],
  };

  db.projects.unshift(newProject);
  writeLocalDb(db);
  return toProjectSummary(newProject, db.submissions);
}

export async function updateProject(
  id: string,
  payload: Partial<Project> & { auditAction?: string; auditDetails?: string; actor?: string }
): Promise<Project> {
  const remote = await tryFetchJson<Project>(`/api/projects/${encodeURIComponent(id)}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (remote) return remote;

  const db = readLocalDb();
  const idx = db.projects.findIndex((p) => p.id === id);
  if (idx === -1) throw new Error('المشروع غير موجود');

  const existing = db.projects[idx];
  const now = new Date().toISOString();
  const updatedAudit = [...(payload.auditLog ?? existing.auditLog)];
  if (payload.auditAction) {
    updatedAudit.unshift({
      id: `al_${Date.now()}`,
      timestamp: now,
      actor: payload.actor || 'مدير التسويق والمبيعات',
      action: payload.auditAction,
      details: payload.auditDetails || '',
    });
  }

  const updated: Project = {
    ...existing,
    title: payload.title ?? existing.title,
    sector: payload.sector ?? existing.sector,
    country: payload.country ?? existing.country,
    description: payload.description ?? existing.description,
    status: payload.status ?? existing.status,
    category: payload.category ?? existing.category,
    allowOffline: payload.allowOffline ?? existing.allowOffline,
    webhookUrl: payload.webhookUrl ?? existing.webhookUrl,
    questions: payload.questions ?? existing.questions,
    team: payload.team ?? existing.team,
    version: payload.questions ? existing.version + 1 : payload.version ?? existing.version,
    updatedAt: now,
    auditLog: updatedAudit.slice(0, 50),
  };

  db.projects[idx] = updated;
  writeLocalDb(db);
  return updated;
}

export async function deleteProject(id: string): Promise<void> {
  const remote = await tryFetchJson<{ ok: boolean }>(`/api/projects/${encodeURIComponent(id)}`, {
    method: 'DELETE',
  });
  if (remote) return;

  const db = readLocalDb();
  db.projects = db.projects.filter((p) => p.id !== id);
  db.submissions = db.submissions.filter((s) => s.projectId !== id);
  writeLocalDb(db);
}

export async function fetchSubmissions(projectId: string): Promise<FormSubmission[]> {
  const remote = await tryFetchJson<FormSubmission[]>(
    `/api/projects/${encodeURIComponent(projectId)}/submissions`
  );
  if (remote) return remote;

  const db = readLocalDb();
  return db.submissions
    .filter((s) => s.projectId === projectId)
    .sort((a, b) => new Date(b.submittedAt).getTime() - new Date(a.submittedAt).getTime());
}

export async function submitFormResponse(
  projectId: string,
  payload: Partial<FormSubmission>
): Promise<FormSubmission> {
  const remote = await tryFetchJson<FormSubmission>(
    `/api/projects/${encodeURIComponent(projectId)}/submissions`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    }
  );
  if (remote) return remote;

  const db = readLocalDb();
  const project = db.projects.find((p) => p.id === projectId);
  if (!project) throw new Error('المشروع غير موجود');

  const now = new Date().toISOString();
  const answers = payload.answers || {};
  const { geoPoint, photos } = extractAttachments(project, answers);

  const newSub: FormSubmission = {
    id: payload.id || `sub_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    projectId: project.id,
    submittedAt: payload.submittedAt || now,
    startTime: payload.startTime || now,
    endTime: payload.endTime || now,
    submittedBy: payload.submittedBy?.trim() || 'مندوب ميداني',
    validationStatus: payload.validationStatus || 'pending',
    answers,
    geoPoint: payload.geoPoint ?? geoPoint,
    photos: payload.photos ?? photos,
    offlineSynced: payload.offlineSynced ?? false,
  };

  db.submissions.unshift(newSub);
  writeLocalDb(db);
  return newSub;
}

export async function updateSubmission(
  projectId: string,
  subId: string,
  payload: Partial<FormSubmission>
): Promise<FormSubmission> {
  const remote = await tryFetchJson<FormSubmission>(
    `/api/projects/${encodeURIComponent(projectId)}/submissions/${encodeURIComponent(subId)}`,
    {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    }
  );
  if (remote) return remote;

  const db = readLocalDb();
  const idx = db.submissions.findIndex((s) => s.id === subId && s.projectId === projectId);
  if (idx === -1) throw new Error('الاستجابة غير موجودة');

  const existing = db.submissions[idx];
  const updated: FormSubmission = {
    ...existing,
    validationStatus: payload.validationStatus ?? existing.validationStatus,
    answers: payload.answers ?? existing.answers,
    submittedBy: payload.submittedBy ?? existing.submittedBy,
  };
  db.submissions[idx] = updated;
  writeLocalDb(db);
  return updated;
}

export async function bulkActionSubmissions(
  projectId: string,
  ids: string[],
  action: 'validate' | 'delete',
  validationStatus?: ValidationStatus
): Promise<void> {
  const remote = await tryFetchJson<{ ok: boolean }>(
    `/api/projects/${encodeURIComponent(projectId)}/submissions/bulk-action`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids, action, validationStatus }),
    }
  );
  if (remote) return;

  const db = readLocalDb();
  if (action === 'delete') {
    db.submissions = db.submissions.filter(
      (s) => !(s.projectId === projectId && ids.includes(s.id))
    );
  } else if (action === 'validate' && validationStatus) {
    db.submissions = db.submissions.map((s) =>
      s.projectId === projectId && ids.includes(s.id)
        ? { ...s, validationStatus }
        : s
    );
  }
  writeLocalDb(db);
}

export async function deleteSubmission(projectId: string, subId: string): Promise<void> {
  const remote = await tryFetchJson<{ ok: boolean }>(
    `/api/projects/${encodeURIComponent(projectId)}/submissions/${encodeURIComponent(subId)}`,
    { method: 'DELETE' }
  );
  if (remote) return;

  const db = readLocalDb();
  db.submissions = db.submissions.filter(
    (s) => !(s.projectId === projectId && s.id === subId)
  );
  writeLocalDb(db);
}

export function getOfflineQueue(): OfflineQueuedSubmission[] {
  try {
    const raw = localStorage.getItem(OFFLINE_QUEUE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function addToOfflineQueue(item: OfflineQueuedSubmission): OfflineQueuedSubmission[] {
  const current = getOfflineQueue();
  const next = [item, ...current];
  localStorage.setItem(OFFLINE_QUEUE_KEY, JSON.stringify(next));
  return next;
}

export function clearOfflineItems(localIds: string[]): OfflineQueuedSubmission[] {
  const current = getOfflineQueue();
  const next = current.filter((i) => !localIds.includes(i.localId));
  localStorage.setItem(OFFLINE_QUEUE_KEY, JSON.stringify(next));
  return next;
}

export async function syncOfflineQueueForProject(
  projectId?: string
): Promise<{ syncedCount: number; remaining: OfflineQueuedSubmission[] }> {
  const queue = getOfflineQueue();
  const targets = projectId ? queue.filter((q) => q.projectId === projectId) : queue;
  if (targets.length === 0) {
    return { syncedCount: 0, remaining: queue };
  }

  const byProject = new Map<string, OfflineQueuedSubmission[]>();
  for (const item of targets) {
    const arr = byProject.get(item.projectId) || [];
    arr.push(item);
    byProject.set(item.projectId, arr);
  }

  let totalSynced = 0;
  const syncedLocalIds: string[] = [];

  for (const [pid, items] of byProject.entries()) {
    const remote = await tryFetchJson<{ syncedCount: number }>(
      `/api/projects/${encodeURIComponent(pid)}/sync-batch`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          submissions: items.map((item) => ({
            submittedAt: item.submittedAt,
            startTime: item.startTime,
            endTime: item.endTime,
            submittedBy: item.submittedBy,
            answers: item.answers,
          })),
        }),
      }
    );

    if (remote) {
      totalSynced += items.length;
      syncedLocalIds.push(...items.map((i) => i.localId));
    } else {
      // Fallback: commit directly to local DB
      for (const item of items) {
        await submitFormResponse(pid, {
          submittedAt: item.submittedAt,
          startTime: item.startTime,
          endTime: item.endTime,
          submittedBy: item.submittedBy,
          answers: item.answers,
          offlineSynced: true,
        });
        totalSynced += 1;
        syncedLocalIds.push(item.localId);
      }
    }
  }

  const remaining = clearOfflineItems(syncedLocalIds);
  return { syncedCount: totalSynced, remaining };
}

export function formatCellDisplay(
  val: unknown,
  question?: Project['questions'][number]
): string {
  if (val === null || val === undefined || val === '') return '—';
  if (Array.isArray(val)) {
    if (val.length === 0) return '—';
    if (question?.options) {
      return val
        .map((v) => question.options?.find((o) => o.value === v)?.label ?? String(v))
        .join('، ');
    }
    return val.map(String).join('، ');
  }
  if (typeof val === 'object') {
    const obj = val as Record<string, unknown>;
    if ('lat' in obj && 'lng' in obj) {
      return `${Number(obj.lat).toFixed(4)}, ${Number(obj.lng).toFixed(4)}`;
    }
    return Object.entries(obj)
      .map(([k, v]) => `${k}: ${String(v)}`)
      .join(' | ');
  }
  if (question?.options) {
    const found = question.options.find((o) => o.value === String(val));
    if (found) return found.label;
  }
  if (typeof val === 'boolean') return val ? 'موافق' : 'غير موافق';
  return String(val);
}

export function exportProjectToExcel(project: Project, submissions: FormSubmission[]): void {
  const statusAr: Record<ValidationStatus, string> = {
    approved: 'معتمد',
    pending: 'قيد المراجعة',
    on_hold: 'معلق للمتابعة',
    rejected: 'مرفوض',
  };

  const dataQuestions = project.questions.filter((q) => q.type !== 'note');

  const rows = submissions.map((s, idx) => {
    const row: Record<string, string | number> = {
      '#': idx + 1,
      'معرف الاستجابة': s.id,
      'تاريخ الإرسال': new Date(s.submittedAt).toLocaleString('ar-SY'),
      'المندوب / المُرسل': s.submittedBy,
      'حالة الاعتماد': statusAr[s.validationStatus] || s.validationStatus,
      'خط العرض (Lat)': s.geoPoint ? s.geoPoint.lat : '',
      'خط الطول (Lng)': s.geoPoint ? s.geoPoint.lng : '',
    };

    for (const q of dataQuestions) {
      const val = s.answers[q.name];
      if (
        (q.type === 'integer' ||
          q.type === 'decimal' ||
          q.type === 'range' ||
          q.type === 'calculate' ||
          q.type === 'rating') &&
        typeof val === 'number'
      ) {
        row[q.label] = val;
      } else {
        row[q.label] = formatCellDisplay(val, q);
      }
    }
    return row;
  });

  const wsData = XLSX.utils.json_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  wb.Workbook = { Views: [{ RTL: true }] };
  XLSX.utils.book_append_sheet(wb, wsData, 'البيانات الميدانية');

  const summaryRows = [
    { 'البند': 'الشركة', 'القيمة': 'شركة أكديما لإنتاج وتوزيع الأدوية البيطرية' },
    { 'البند': 'اسم المشروع', 'القيمة': project.title },
    { 'البند': 'القطاع', 'القيمة': project.sector },
    { 'البند': 'الدولة / النطاق', 'القيمة': project.country },
    { 'البند': 'رقم الإصدار', 'القيمة': `v${project.version}` },
    { 'البند': 'إجمالي الاستجابات', 'القيمة': String(submissions.length) },
    {
      'البند': 'الاستجابات المعتمدة',
      'القيمة': String(submissions.filter((s) => s.validationStatus === 'approved').length),
    },
    { 'البند': 'تاريخ التصدير', 'القيمة': new Date().toLocaleString('ar-SY') },
  ];
  const wsSummary = XLSX.utils.json_to_sheet(summaryRows);
  XLSX.utils.book_append_sheet(wb, wsSummary, 'ملخص التقرير');

  XLSX.writeFile(wb, `acdima_${project.id}_report.xlsx`);
}

function escapeCsvCell(text: string): string {
  const clean = text.replace(/\r?\n/g, ' ');
  if (clean.includes(',') || clean.includes('"')) {
    return `"${clean.replace(/"/g, '""')}"`;
  }
  return clean;
}

export function exportProjectToCsv(project: Project, submissions: FormSubmission[]): void {
  const statusAr: Record<ValidationStatus, string> = {
    approved: 'معتمد',
    pending: 'قيد المراجعة',
    on_hold: 'معلق للمتابعة',
    rejected: 'مرفوض',
  };

  const dataQuestions = project.questions.filter((q) => q.type !== 'note');
  const headers = [
    'معرف_الاستجابة',
    'تاريخ_الإرسال',
    'المُرسل',
    'حالة_الاعتماد',
    'خط_العرض_Lat',
    'خط_الطول_Lng',
    ...dataQuestions.map((q) => q.label),
  ];

  const rows = submissions.map((s) => [
    s.id,
    s.submittedAt,
    s.submittedBy,
    statusAr[s.validationStatus] || s.validationStatus,
    s.geoPoint ? String(s.geoPoint.lat) : '',
    s.geoPoint ? String(s.geoPoint.lng) : '',
    ...dataQuestions.map((q) => formatCellDisplay(s.answers[q.name], q)),
  ]);

  const csvContent =
    '\uFEFF' +
    [headers.map(escapeCsvCell).join(','), ...rows.map((r) => r.map(escapeCsvCell).join(','))].join(
      '\r\n'
    );

  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `acdima_${project.id}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function exportProjectToJson(project: Project, submissions: FormSubmission[]): void {
  const payload = {
    company: 'شركة أكديما لإنتاج وتوزيع الأدوية البيطرية',
    project_id: project.id,
    project_title: project.title,
    country: project.country,
    version: project.version,
    count: submissions.length,
    results: submissions.map((s) => ({
      _id: s.id,
      _submitted_at: s.submittedAt,
      _submitted_by: s.submittedBy,
      _validation_status: s.validationStatus,
      _lat: s.geoPoint?.lat ?? null,
      _lng: s.geoPoint?.lng ?? null,
      ...s.answers,
    })),
  };

  const blob = new Blob([JSON.stringify(payload, null, 2)], {
    type: 'application/json;charset=utf-8',
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `acdima_${project.id}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
