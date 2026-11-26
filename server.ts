import express from 'express';
import fs from 'fs';
import path from 'path';
import { createServer as createViteServer } from 'vite';
import { INITIAL_PROJECTS, INITIAL_SUBMISSIONS } from './src/data/seedData.ts';
import type { FormSubmission, Project, ProjectSummary, ValidationStatus } from './src/types/kobo.ts';

interface DatabaseSchema {
  projects: Project[];
  submissions: FormSubmission[];
}

const DATA_DIR = path.resolve(process.cwd(), 'data');
const DB_FILE = path.join(DATA_DIR, 'db.json');

function ensureDb(): DatabaseSchema {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  if (!fs.existsSync(DB_FILE)) {
    const initial: DatabaseSchema = {
      projects: INITIAL_PROJECTS,
      submissions: INITIAL_SUBMISSIONS,
    };
    fs.writeFileSync(DB_FILE, JSON.stringify(initial, null, 2), 'utf-8');
    return initial;
  }
  try {
    const raw = fs.readFileSync(DB_FILE, 'utf-8');
    const parsed = JSON.parse(raw) as DatabaseSchema;
    if (!Array.isArray(parsed.projects) || !Array.isArray(parsed.submissions)) {
      throw new Error('Invalid DB structure');
    }
    return parsed;
  } catch {
    const fallback: DatabaseSchema = {
      projects: INITIAL_PROJECTS,
      submissions: INITIAL_SUBMISSIONS,
    };
    fs.writeFileSync(DB_FILE, JSON.stringify(fallback, null, 2), 'utf-8');
    return fallback;
  }
}

function saveDb(db: DatabaseSchema): void {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2), 'utf-8');
}

function formatAnswerForExport(val: unknown, question?: Project['questions'][number]): string {
  if (val === null || val === undefined) return '';
  if (Array.isArray(val)) {
    if (question?.options) {
      return val
        .map((v) => question.options?.find((o) => o.value === v)?.label ?? String(v))
        .join(' | ');
    }
    return val.map(String).join(' | ');
  }
  if (typeof val === 'object') {
    const obj = val as Record<string, unknown>;
    if ('lat' in obj && 'lng' in obj) {
      return `${obj.lat}, ${obj.lng}`;
    }
    return Object.entries(obj)
      .map(([k, v]) => `${k}: ${String(v)}`)
      .join(' | ');
  }
  if (question?.options) {
    const matched = question.options.find((o) => o.value === String(val));
    if (matched) return matched.label;
  }
  if (typeof val === 'boolean') return val ? 'نعم' : 'لا';
  return String(val);
}

function escapeCsvCell(text: string): string {
  const clean = text.replace(/\r?\n/g, ' ');
  if (clean.includes(',') || clean.includes('"')) {
    return `"${clean.replace(/"/g, '""')}"`;
  }
  return clean;
}

async function startServer() {
  const app = express();
  app.use(express.json({ limit: '15mb' }));

  // Initialize database on startup
  ensureDb();

  // List projects with summary metrics
  app.get('/api/projects', (_req, res) => {
    const db = ensureDb();
    const summaries: ProjectSummary[] = db.projects.map((project) => {
      const subs = db.submissions.filter((s) => s.projectId === project.id);
      const approvedCount = subs.filter((s) => s.validationStatus === 'approved').length;
      const latest = subs
        .map((s) => s.submittedAt)
        .sort((a, b) => new Date(b).getTime() - new Date(a).getTime())[0] ?? null;

      return {
        ...project,
        submissionCount: subs.length,
        approvedCount,
        latestSubmissionAt: latest,
      };
    });
    res.json(summaries);
  });

  // Create new project
  app.post('/api/projects', (req, res) => {
    const db = ensureDb();
    const body = req.body as Partial<Project>;
    const now = new Date().toISOString();
    const newProject: Project = {
      id: body.id || `proj_${Date.now()}`,
      title: body.title?.trim() || 'مشروع جمع بيانات بيطري جديد',
      sector: body.sector?.trim() || 'شركة أكديما — إنتاج وتوزيع الأدوية البيطرية',
      country: body.country?.trim() || 'الجمهورية العربية السورية',
      description: body.description?.trim() || '',
      status: body.status || 'draft',
      category: body.category || 'custom',
      createdAt: now,
      updatedAt: now,
      version: 1,
      allowOffline: body.allowOffline ?? true,
      webhookUrl: body.webhookUrl || '',
      questions: Array.isArray(body.questions) ? body.questions : [],
      team: Array.isArray(body.team) && body.team.length > 0
        ? body.team
        : [
            {
              id: `tm_${Date.now()}`,
              username: 'admin.vet',
              fullName: 'مدير النظام البيطري',
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
          details: `تم إنشاء مشروع "${body.title?.trim() || 'مشروع جديد'}" بنجاح.`,
        },
      ],
    };

    db.projects.unshift(newProject);
    saveDb(db);
    res.status(201).json({
      ...newProject,
      submissionCount: 0,
      approvedCount: 0,
      latestSubmissionAt: null,
    });
  });

  // Get single project
  app.get('/api/projects/:id', (req, res) => {
    const db = ensureDb();
    const project = db.projects.find((p) => p.id === req.params.id);
    if (!project) {
      res.status(404).json({ error: 'المشروع غير موجود' });
      return;
    }
    const subs = db.submissions.filter((s) => s.projectId === project.id);
    const approvedCount = subs.filter((s) => s.validationStatus === 'approved').length;
    const latest = subs
      .map((s) => s.submittedAt)
      .sort((a, b) => new Date(b).getTime() - new Date(a).getTime())[0] ?? null;

    res.json({
      ...project,
      submissionCount: subs.length,
      approvedCount,
      latestSubmissionAt: latest,
    });
  });

  // Update project (metadata, questions, team, status)
  app.put('/api/projects/:id', (req, res) => {
    const db = ensureDb();
    const idx = db.projects.findIndex((p) => p.id === req.params.id);
    if (idx === -1) {
      res.status(404).json({ error: 'المشروع غير موجود' });
      return;
    }

    const existing = db.projects[idx];
    const updates = req.body as Partial<Project> & { auditAction?: string; auditDetails?: string; actor?: string };
    const now = new Date().toISOString();

    const updatedAudit = [...(updates.auditLog ?? existing.auditLog)];
    if (updates.auditAction) {
      updatedAudit.unshift({
        id: `al_${Date.now()}`,
        timestamp: now,
        actor: updates.actor || 'مدير التسويق والمبيعات',
        action: updates.auditAction,
        details: updates.auditDetails || '',
      });
    }

    const updated: Project = {
      ...existing,
      title: updates.title ?? existing.title,
      sector: updates.sector ?? existing.sector,
      country: updates.country ?? existing.country,
      description: updates.description ?? existing.description,
      status: updates.status ?? existing.status,
      category: updates.category ?? existing.category,
      allowOffline: updates.allowOffline ?? existing.allowOffline,
      webhookUrl: updates.webhookUrl ?? existing.webhookUrl,
      questions: updates.questions ?? existing.questions,
      team: updates.team ?? existing.team,
      version: updates.questions ? existing.version + 1 : updates.version ?? existing.version,
      updatedAt: now,
      auditLog: updatedAudit.slice(0, 50),
    };

    db.projects[idx] = updated;
    saveDb(db);
    res.json(updated);
  });

  // Delete project
  app.delete('/api/projects/:id', (req, res) => {
    const db = ensureDb();
    db.projects = db.projects.filter((p) => p.id !== req.params.id);
    db.submissions = db.submissions.filter((s) => s.projectId !== req.params.id);
    saveDb(db);
    res.json({ ok: true });
  });

  // List submissions for project
  app.get('/api/projects/:id/submissions', (req, res) => {
    const db = ensureDb();
    const subs = db.submissions
      .filter((s) => s.projectId === req.params.id)
      .sort((a, b) => new Date(b.submittedAt).getTime() - new Date(a.submittedAt).getTime());
    res.json(subs);
  });

  // Add submission
  app.post('/api/projects/:id/submissions', (req, res) => {
    const db = ensureDb();
    const project = db.projects.find((p) => p.id === req.params.id);
    if (!project) {
      res.status(404).json({ error: 'المشروع غير موجود' });
      return;
    }

    const body = req.body as Partial<FormSubmission>;
    const now = new Date().toISOString();
    const answers = body.answers || {};

    // Extract geopoint & image attachments automatically from answers if present
    let geoPoint = body.geoPoint ?? null;
    const photos: { questionId: string; url: string; caption?: string }[] = Array.isArray(body.photos)
      ? [...body.photos]
      : [];

    for (const q of project.questions) {
      const val = answers[q.name];
      if (q.type === 'geopoint' && val && typeof val === 'object' && 'lat' in val && 'lng' in val) {
        geoPoint = val as { lat: number; lng: number; accuracy?: number };
      }
      if (q.type === 'image' && typeof val === 'string' && val.length > 0) {
        if (!photos.some((p) => p.questionId === q.id)) {
          photos.push({ questionId: q.id, url: val, caption: q.label });
        }
      }
    }

    const newSub: FormSubmission = {
      id: body.id || `sub_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      projectId: project.id,
      submittedAt: body.submittedAt || now,
      startTime: body.startTime || now,
      endTime: body.endTime || now,
      submittedBy: body.submittedBy?.trim() || 'مندوب ميداني',
      validationStatus: body.validationStatus || 'pending',
      answers,
      geoPoint,
      photos,
      offlineSynced: body.offlineSynced ?? false,
    };

    db.submissions.unshift(newSub);
    saveDb(db);
    res.status(201).json(newSub);
  });

  // Batch sync offline submissions
  app.post('/api/projects/:id/sync-batch', (req, res) => {
    const db = ensureDb();
    const project = db.projects.find((p) => p.id === req.params.id);
    if (!project) {
      res.status(404).json({ error: 'المشروع غير موجود' });
      return;
    }

    const items = (req.body?.submissions || []) as Partial<FormSubmission>[];
    const synced: FormSubmission[] = [];
    const now = new Date().toISOString();

    for (const body of items) {
      const answers = body.answers || {};
      let geoPoint = body.geoPoint ?? null;
      const photos: { questionId: string; url: string; caption?: string }[] = Array.isArray(body.photos)
        ? [...body.photos]
        : [];

      for (const q of project.questions) {
        const val = answers[q.name];
        if (q.type === 'geopoint' && val && typeof val === 'object' && 'lat' in val && 'lng' in val) {
          geoPoint = val as { lat: number; lng: number; accuracy?: number };
        }
        if (q.type === 'image' && typeof val === 'string' && val.length > 0) {
          if (!photos.some((p) => p.questionId === q.id)) {
            photos.push({ questionId: q.id, url: val, caption: q.label });
          }
        }
      }

      const newSub: FormSubmission = {
        id: body.id || `sub_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        projectId: project.id,
        submittedAt: body.submittedAt || now,
        startTime: body.startTime || now,
        endTime: body.endTime || now,
        submittedBy: body.submittedBy?.trim() || 'مندوب ميداني (مزامنة)',
        validationStatus: 'pending',
        answers,
        geoPoint,
        photos,
        offlineSynced: true,
      };
      db.submissions.unshift(newSub);
      synced.push(newSub);
    }

    saveDb(db);
    res.status(201).json({ syncedCount: synced.length, submissions: synced });
  });

  // Update submission (validation status or answers)
  app.patch('/api/projects/:id/submissions/:subId', (req, res) => {
    const db = ensureDb();
    const idx = db.submissions.findIndex(
      (s) => s.id === req.params.subId && s.projectId === req.params.id
    );
    if (idx === -1) {
      res.status(404).json({ error: 'الاستجابة غير موجودة' });
      return;
    }

    const existing = db.submissions[idx];
    const body = req.body as Partial<FormSubmission>;
    const updated: FormSubmission = {
      ...existing,
      validationStatus: body.validationStatus ?? existing.validationStatus,
      answers: body.answers ?? existing.answers,
      submittedBy: body.submittedBy ?? existing.submittedBy,
    };

    db.submissions[idx] = updated;
    saveDb(db);
    res.json(updated);
  });

  // Bulk validate or delete
  app.post('/api/projects/:id/submissions/bulk-action', (req, res) => {
    const db = ensureDb();
    const { ids, action, validationStatus } = req.body as {
      ids: string[];
      action: 'validate' | 'delete';
      validationStatus?: ValidationStatus;
    };

    if (!Array.isArray(ids) || ids.length === 0) {
      res.status(400).json({ error: 'يرجى تحديد صف واحد على الأقل' });
      return;
    }

    if (action === 'delete') {
      db.submissions = db.submissions.filter(
        (s) => !(s.projectId === req.params.id && ids.includes(s.id))
      );
    } else if (action === 'validate' && validationStatus) {
      db.submissions = db.submissions.map((s) =>
        s.projectId === req.params.id && ids.includes(s.id)
          ? { ...s, validationStatus }
          : s
      );
    }

    saveDb(db);
    res.json({ ok: true });
  });

  // Delete single submission
  app.delete('/api/projects/:id/submissions/:subId', (req, res) => {
    const db = ensureDb();
    db.submissions = db.submissions.filter(
      (s) => !(s.projectId === req.params.id && s.id === req.params.subId)
    );
    saveDb(db);
    res.json({ ok: true });
  });

  // Export UTF-8 BOM CSV for Excel & Google Sheets IMPORTDATA
  app.get('/api/projects/:id/export/csv', (req, res) => {
    const db = ensureDb();
    const project = db.projects.find((p) => p.id === req.params.id);
    if (!project) {
      res.status(404).send('Project not found');
      return;
    }

    const subs = db.submissions.filter((s) => s.projectId === project.id);
    const headers = [
      'معرف_الاستجابة',
      'تاريخ_الإرسال',
      'المُرسل',
      'حالة_الاعتماد',
      'خط_العرض_Lat',
      'خط_الطول_Lng',
      ...project.questions.filter((q) => q.type !== 'note').map((q) => q.label),
    ];

    const statusAr: Record<ValidationStatus, string> = {
      approved: 'معتمد',
      pending: 'قيد المراجعة',
      on_hold: 'معلق للمتابعة',
      rejected: 'مرفوض',
    };

    const rows = subs.map((s) => [
      s.id,
      s.submittedAt,
      s.submittedBy,
      statusAr[s.validationStatus] || s.validationStatus,
      s.geoPoint ? String(s.geoPoint.lat) : '',
      s.geoPoint ? String(s.geoPoint.lng) : '',
      ...project.questions
        .filter((q) => q.type !== 'note')
        .map((q) => formatAnswerForExport(s.answers[q.name], q)),
    ]);

    const csvContent =
      '\uFEFF' +
      [headers.map(escapeCsvCell).join(','), ...rows.map((r) => r.map(escapeCsvCell).join(','))].join(
        '\r\n'
      );

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${encodeURIComponent(project.id)}.csv"`
    );
    res.send(csvContent);
  });

  // Export JSON feed (Power BI & External API Connector)
  app.get('/api/projects/:id/export/json', (req, res) => {
    const db = ensureDb();
    const project = db.projects.find((p) => p.id === req.params.id);
    if (!project) {
      res.status(404).json({ error: 'المشروع غير موجود' });
      return;
    }
    const subs = db.submissions.filter((s) => s.projectId === project.id);
    const formatted = subs.map((s) => {
      const record: Record<string, unknown> = {
        _id: s.id,
        _submitted_at: s.submittedAt,
        _submitted_by: s.submittedBy,
        _validation_status: s.validationStatus,
        _lat: s.geoPoint?.lat ?? null,
        _lng: s.geoPoint?.lng ?? null,
      };
      for (const q of project.questions) {
        if (q.type !== 'note') {
          record[q.name] = s.answers[q.name] ?? null;
        }
      }
      return record;
    });

    res.json({
      project_id: project.id,
      project_title: project.title,
      version: project.version,
      count: formatted.length,
      results: formatted,
    });
  });

  // Vite middleware for development / static dist for production
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  const PORT = Number(process.env.PORT) || 3000;
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`VitaField Kobo Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
