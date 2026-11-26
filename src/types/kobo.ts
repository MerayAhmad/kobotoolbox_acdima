export type QuestionType =
  | 'select_one'
  | 'select_multiple'
  | 'text'
  | 'integer'
  | 'decimal'
  | 'date'
  | 'time'
  | 'datetime'
  | 'geopoint'
  | 'image'
  | 'audio'
  | 'video'
  | 'geotrace'
  | 'note'
  | 'barcode'
  | 'acknowledge'
  | 'geoshape'
  | 'rating'
  | 'matrix'
  | 'rank'
  | 'calculate'
  | 'hidden'
  | 'file'
  | 'range'
  | 'xml'
  | 'signature';

export interface QuestionTypeMeta {
  type: QuestionType;
  labelAr: string;
  labelEn: string;
  badge: string;
  category: 'choice' | 'text_num' | 'date_geo' | 'media' | 'advanced';
  descriptionAr: string;
}

export const QUESTION_TYPES: QuestionTypeMeta[] = [
  { type: 'select_one', labelAr: 'اختيار واحد', labelEn: 'Select One', badge: '◉', category: 'choice', descriptionAr: 'اختيار إجابة واحدة من قائمة' },
  { type: 'select_multiple', labelAr: 'اختيار متعدد', labelEn: 'Select Many', badge: '☑', category: 'choice', descriptionAr: 'اختيار أكثر من إجابة' },
  { type: 'text', labelAr: 'نص', labelEn: 'Text', badge: 'abc', category: 'text_num', descriptionAr: 'إجابة نصية حرة' },
  { type: 'integer', labelAr: 'رقم صحيح', labelEn: 'Number', badge: '123', category: 'text_num', descriptionAr: 'أرقام صحيحة مثل الكميات والزيارات' },
  { type: 'decimal', labelAr: 'رقم عشري', labelEn: 'Decimal', badge: '1.0', category: 'text_num', descriptionAr: 'أسعار أو نسب عشرية' },
  { type: 'date', labelAr: 'تاريخ', labelEn: 'Date', badge: 'تاريخ', category: 'date_geo', descriptionAr: 'تحديد يوم وشهر وسنة' },
  { type: 'time', labelAr: 'وقت', labelEn: 'Time', badge: 'وقت', category: 'date_geo', descriptionAr: 'تحديد الساعة والدقيقة' },
  { type: 'datetime', labelAr: 'تاريخ ووقت', labelEn: 'Date & time', badge: 'زمن', category: 'date_geo', descriptionAr: 'طابع زمني كامل للزيارة' },
  { type: 'geopoint', labelAr: 'نقطة جغرافية GPS', labelEn: 'Point', badge: 'GPS', category: 'date_geo', descriptionAr: 'التقاط إحداثيات الموقع الحالي' },
  { type: 'image', labelAr: 'صورة', labelEn: 'Photo', badge: 'صورة', category: 'media', descriptionAr: 'التقاط أو رفع صورة ميدانية' },
  { type: 'audio', labelAr: 'تسجيل صوتي', labelEn: 'Audio', badge: 'صوت', category: 'media', descriptionAr: 'تسجيل ملاحظة صوتية' },
  { type: 'video', labelAr: 'فيديو', labelEn: 'Video', badge: 'فيديو', category: 'media', descriptionAr: 'إرفاق مقطع فيديو قصير' },
  { type: 'geotrace', labelAr: 'مسار جغرافي', labelEn: 'Line', badge: 'مسار', category: 'date_geo', descriptionAr: 'تحديد خط مسار التوزيع' },
  { type: 'note', labelAr: 'ملاحظة توضيحية', labelEn: 'Note', badge: 'ملاحظة', category: 'text_num', descriptionAr: 'نص إرشادي للمندوب أو العميل' },
  { type: 'barcode', labelAr: 'باركود / QR', labelEn: 'Barcode / QR Code', badge: 'QR', category: 'advanced', descriptionAr: 'مسح أو إدخال رمز التشغيلة الدوائية' },
  { type: 'acknowledge', labelAr: 'إقرار وموافقة', labelEn: 'Acknowledge', badge: '✓', category: 'choice', descriptionAr: 'مربع تأكيد دقة البيانات' },
  { type: 'geoshape', labelAr: 'منطقة جغرافية', labelEn: 'Area', badge: 'نطاق', category: 'date_geo', descriptionAr: 'رسم حدود منطقة التغطية' },
  { type: 'rating', labelAr: 'تقييم بالنجوم', labelEn: 'Rating', badge: '★', category: 'choice', descriptionAr: 'مقياس تقييم من 1 إلى 5' },
  { type: 'matrix', labelAr: 'مصفوفة أسئلة', labelEn: 'Question Matrix', badge: 'جدول', category: 'advanced', descriptionAr: 'تقييم عدة منتجات ضمن جدول واحد' },
  { type: 'rank', labelAr: 'ترتيب أولويات', labelEn: 'Ranking', badge: 'ترتيب', category: 'choice', descriptionAr: 'ترتيب الخيارات حسب الأهمية' },
  { type: 'calculate', labelAr: 'حقل محسوب', labelEn: 'Calculate', badge: '1+1', category: 'advanced', descriptionAr: 'حساب تلقائي بناءً على إجابات سابقة' },
  { type: 'hidden', labelAr: 'حقل مخفي', labelEn: 'Hidden', badge: 'مخفي', category: 'advanced', descriptionAr: 'متغير خلفي غير ظاهر للمستخدم' },
  { type: 'file', labelAr: 'ملف مرفق', labelEn: 'File', badge: 'ملف', category: 'media', descriptionAr: 'رفع فاتورة أو مستند PDF' },
  { type: 'range', labelAr: 'نطاق رقمي', labelEn: 'Range', badge: '1..10', category: 'text_num', descriptionAr: 'شريط تمرير لتحديد نسبة أو قيمة' },
  { type: 'xml', labelAr: 'بيانات خارجية XML', labelEn: 'External XML', badge: 'XML', category: 'advanced', descriptionAr: 'ربط قائمة أصناف خارجية' },
  { type: 'signature', labelAr: 'توقيع العميل', labelEn: 'Signature', badge: 'توقيع', category: 'media', descriptionAr: 'تأكيد استلام أو اعتماد الزيارة' },
];

export type SkipOperator = 'equals' | 'not_equals' | 'contains' | 'gt' | 'lt' | 'is_answered';

export interface SkipCondition {
  questionId: string;
  operator: SkipOperator;
  value: string;
}

export interface SkipLogic {
  match: 'all' | 'any';
  conditions: SkipCondition[];
}

export interface QuestionOption {
  value: string;
  label: string;
}

export interface FormQuestion {
  id: string;
  name: string;
  label: string;
  hint?: string;
  type: QuestionType;
  required: boolean;
  options?: QuestionOption[];
  matrixRows?: string[];
  matrixCols?: string[];
  rangeMin?: number;
  rangeMax?: number;
  rangeStep?: number;
  formula?: string;
  defaultValue?: string;
  skipLogic?: SkipLogic;
}

export type PermissionKey =
  | 'view_form'
  | 'edit_form'
  | 'view_submissions'
  | 'view_submissions_own'
  | 'view_submissions_cond'
  | 'add_submissions'
  | 'edit_submissions'
  | 'edit_submissions_own'
  | 'edit_submissions_cond'
  | 'validate_submissions'
  | 'validate_submissions_own'
  | 'validate_submissions_cond'
  | 'delete_submissions'
  | 'delete_submissions_own'
  | 'delete_submissions_cond'
  | 'manage_project';

export interface TeamMember {
  id: string;
  username: string;
  fullName: string;
  roleTitle: string;
  avatarColor: string;
  permissions: PermissionKey[];
}

export interface AuditEntry {
  id: string;
  timestamp: string;
  actor: string;
  action: string;
  details: string;
}

export type ValidationStatus = 'pending' | 'approved' | 'rejected' | 'on_hold';

export interface GeoPoint {
  lat: number;
  lng: number;
  accuracy?: number;
}

export interface FormSubmission {
  id: string;
  projectId: string;
  submittedAt: string;
  startTime: string;
  endTime: string;
  submittedBy: string;
  validationStatus: ValidationStatus;
  answers: Record<string, unknown>;
  geoPoint?: GeoPoint | null;
  photos?: { questionId: string; url: string; caption?: string }[];
  offlineSynced?: boolean;
}

export type ProjectStatus = 'deployed' | 'draft' | 'archived';

export type ProjectCategory =
  | 'visits'
  | 'market'
  | 'reps'
  | 'distributors'
  | 'satisfaction'
  | 'custom';

export interface Project {
  id: string;
  title: string;
  sector: string;
  country: string;
  description: string;
  status: ProjectStatus;
  category: ProjectCategory;
  createdAt: string;
  updatedAt: string;
  version: number;
  allowOffline: boolean;
  webhookUrl?: string;
  questions: FormQuestion[];
  team: TeamMember[];
  auditLog: AuditEntry[];
}

export interface ProjectSummary extends Project {
  submissionCount: number;
  approvedCount: number;
  latestSubmissionAt: string | null;
}

export interface LibraryBlock {
  id: string;
  title: string;
  category: string;
  description: string;
  questions: Omit<FormQuestion, 'id'>[];
}
