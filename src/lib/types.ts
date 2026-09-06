export type RoleCode = 'STAFF'|'LEADER'|'ASSMAN'|'PLANT_MANAGER'|'GENERAL_MANAGER'|'BOD_KI'|'BOD_BEI'|'ADMIN';
export type KpiStatus = 'DRAFT'|'SUBMITTED'|'CHECKED'|'VERIFIED'|'APPROVED'|'REJECTED'|'ARCHIVED'|'NOT_SUBMITTED';

export interface AppUser {
  id: string;
  auth_user_id?: string;
  employee_code: string;
  username: string;
  email: string;
  full_name: string;
  department_id: string | null;
  department_name?: string | null;
  section: string | null;
  position_name: string | null;
  academic?: string | null;
  join_date?: string | null;
  role_code: RoleCode;
  active: boolean;
  must_change_password: boolean;
}

export interface Department {
  id: string;
  department_code: string;
  department_name: string;
  plant_code?: string | null;
  active: boolean;
  sort_order: number;
}

export interface KpiPoint {
  id?: string;
  form_id?: string;
  point_no: number;
  subject: string;
  kpi_objective: string;
  uom: string;
  weight_percent: number;
  source_data: string;
  target: number | null;
  actual: number | null;
  calc_type: 'HIGHER_BETTER'|'LOWER_BETTER'|'MANUAL_SCORE';
  manual_score: number | null;
  achievement_percent?: number;
  score_percent?: number;
}

export interface KpiForm {
  id: string;
  form_no: string;
  period_key: string;
  period_year: number;
  period_month: number;
  user_id: string;
  employee_code: string;
  full_name: string;
  department_id: string | null;
  department_name: string | null;
  section: string | null;
  position_name: string | null;
  academic?: string | null;
  join_date?: string | null;
  role_code: RoleCode;
  form_title: string;
  total_weight: number;
  achievement_score: number;
  final_score: number;
  status: KpiStatus;
  current_stage: string | null;
  current_stage_order: number | null;
  due_date?: string | null;
  submitted_at?: string | null;
  approved_at?: string | null;
  review_note?: string | null;
  approval_route?: ApprovalRouteStage[];
  updated_at?: string;
}

export interface ApprovalRouteStage {
  stage: string;
  order: number;
  user_id?: string | null;
  role_code?: RoleCode | null;
  department_id?: string | null;
  full_name?: string | null;
}

export interface ApprovalHistory {
  id: string;
  stage_name: string;
  stage_order: number;
  action: string;
  actor_name: string | null;
  actor_role_code: string | null;
  note: string | null;
  created_at: string;
}

export interface DashboardSummary {
  period: string;
  totalUser: number;
  submittedKpi: number;
  notSubmittedKpi: number;
  approvedKpi: number;
  pendingKpi: number;
  completionRate: number;
  averageAchievement: number;
  averageFinalScore: number;
  departmentTrend: Array<{
    department_name: string;
    total_user: number;
    submitted: number;
    approved: number;
    pending: number;
    avg_achievement: number;
    avg_final: number;
  }>;
  roleTrend: Array<{ role_code: string; total_user: number; submitted: number; avg_final: number }>;
  topPerformer: Array<{ full_name: string; department_name: string; final_score: number }>;
  bottomPerformer: Array<{ full_name: string; department_name: string; final_score: number }>;
  statusDistribution: Array<{ name: string; value: number }>;
  approvalStage: Array<{ name: string; value: number }>;
  recentActivity: Array<Record<string, any>>;
}

export interface ApprovalMatrix {
  id: string;
  matrix_code: string;
  department_id: string | null;
  section: string | null;
  submitter_role_code: string;
  checked1_role_code?: string | null;
  checked1_user_id?: string | null;
  approval1_role_code?: string | null;
  approval1_user_id?: string | null;
  approval2_role_code?: string | null;
  approval2_user_id?: string | null;
  approval3_role_code?: string | null;
  approval3_user_id?: string | null;
  checked2_role_code?: string | null;
  checked2_user_id?: string | null;
  approval4_role_code?: string | null;
  approval4_user_id?: string | null;
  active: boolean;
  priority: number;
  note?: string | null;
}

export interface NotificationItem {
  id: string;
  form_id?: string | null;
  type: string;
  title: string;
  message: string;
  priority: string;
  read_at?: string | null;
  created_at: string;
}
