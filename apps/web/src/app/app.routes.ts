import { Routes } from '@angular/router';
import { authGuard } from './core/guards/auth.guard';
import { permissionGuard } from './core/guards/permission.guard';
import { platformGuard } from './core/guards/platform.guard';

export const routes: Routes = [
  { path: 'account/setup', loadComponent: () => import('./pages/auth/account-setup.component').then(m => m.AccountSetupComponent) },
  { path: 'platform', canActivate: [authGuard, platformGuard], loadComponent: () => import('./pages/platform/platform.component').then(m => m.PlatformComponent) },
  { path: '', redirectTo: 'dashboard', pathMatch: 'full' },
  {
    path: 'dashboard',
    canActivate: [authGuard],
    loadComponent: () => import('./pages/dashboard/pages/dashboard').then(m => m.DashboardComponent),
  },
  {
    path: 'students',
    canActivate: [authGuard, permissionGuard],
    data: { requiredPermission: 'students:read' },
    loadComponent: () => import('./pages/students/pages/students').then(m => m.StudentsComponent),
  },
  {
    path: 'enrollments',
    canActivate: [authGuard, permissionGuard],
    data: { requiredPermission: 'students:update' },
    loadComponent: () => import('./pages/enrollments/pages/enrollments').then(m => m.EnrollmentsComponent),
  },
  {
    path: 'registered-students',
    canActivate: [authGuard, permissionGuard],
    data: { requiredPermission: 'students:read' },
    loadComponent: () => import('./pages/registered-students/pages/registered-students').then(m => m.RegisteredStudentsComponent),
  },
  {
    path: 'staff',
    canActivate: [authGuard, permissionGuard],
    data: { requiredPermission: 'teachers:read' },
    loadComponent: () => import('./pages/staff/pages/staff').then(m => m.StaffComponent),
  },
  {
    path: 'staff-development',
    canActivate: [authGuard, permissionGuard],
    data: { requiredPermission: 'teachers:read' },
    loadComponent: () => import('./pages/staff-development/pages/staff-development').then(m => m.StaffDevelopmentComponent),
  },
  {
    path: 'classes',
    canActivate: [authGuard],
    loadComponent: () => import('./pages/classes/pages/classes.component').then(m => m.ClassesComponent),
  },
  {
    path: 'study-groups',
    canActivate: [authGuard],
    loadComponent: () => import('./pages/study-groups/pages/study-groups').then(m => m.StudyGroupsComponent),
  },
  {
    path: 'subjects',
    canActivate: [authGuard],
    loadComponent: () => import('./pages/subjects/pages/subjects').then(m => m.SubjectsComponent),
  },
  {
    path: 'exams',
    pathMatch: 'full',
    canActivate: [authGuard, permissionGuard],
    data: { requiredPermission: 'exams:read' },
    loadComponent: () => import('./pages/exams/pages/exams').then(m => m.ExamsComponent),
  },
  {
    path: 'exams/new',
    canActivate: [authGuard, permissionGuard],
    data: { requiredPermission: 'exams:create' },
    loadComponent: () => import('./pages/exams/pages/exam-create.component').then(m => m.ExamCreateComponent),
  },
  {
    path: 'exams/:examId/builder',
    canActivate: [authGuard, permissionGuard],
    data: { requiredPermission: 'exams:update' },
    loadComponent: () => import('./pages/exams/pages/exam-builder.component').then(m => m.ExamBuilderComponent),
  },
  {
    path: 'exam-analysis/:examId',
    canActivate: [authGuard, permissionGuard],
    data: { requiredPermission: 'exams:read' },
    loadComponent: () => import('./pages/exam-analysis/pages/exam-analysis').then(m => m.ExamAnalysisComponent),
  },
  {
    path: 'exam-analysis',
    canActivate: [authGuard, permissionGuard],
    data: { requiredPermission: 'exams:read' },
    loadComponent: () => import('./pages/exam-analysis/pages/exam-analysis').then(m => m.ExamAnalysisComponent),
  },
  {
    path: 'academic-years',
    canActivate: [authGuard, permissionGuard],
    data: { requiredPermission: 'settings:read' },
    loadComponent: () => import('./pages/academic-years/pages/academic-years').then(m => m.AcademicYearsComponent),
  },
  {
    path: 'settings',
    canActivate: [authGuard, permissionGuard],
    data: { requiredPermission: 'settings:read' },
    loadComponent: () => import('./pages/settings/pages/settings').then(m => m.SettingsComponent),
  },
  {
    path: 'settings/lookup-tables',
    canActivate: [authGuard, permissionGuard],
    data: { requiredPermission: 'settings:create' },
    loadComponent: () => import('./pages/settings/pages/lookup-tables').then(m => m.LookupTablesComponent),
  },
  {
    path: 'settings/users',
    canActivate: [authGuard, permissionGuard],
    data: { requiredPermission: 'settings:create' },
    loadComponent: () => import('./pages/settings/pages/institution-users').then(m => m.InstitutionUsersComponent),
  },
  {
    path: 'settings/roles',
    canActivate: [authGuard, permissionGuard],
    data: { requiredPermission: 'settings:create' },
    loadComponent: () => import('./pages/settings/pages/roles-permissions').then(m => m.RolesPermissionsComponent),
  },
  {
    path: 'settings/audit-log',
    canActivate: [authGuard, permissionGuard],
    data: { requiredPermission: 'audit:read' },
    loadComponent: () => import('./pages/settings/pages/audit-log').then(m => m.AuditLogComponent),
  },
  {
    path: 'settings/subscription',
    canActivate: [authGuard, permissionGuard],
    data: { requiredPermission: 'subscription:read' },
    loadComponent: () => import('./pages/settings/pages/subscription.component').then(m => m.SubscriptionComponent),
  },
  {
    path: 'login',
    loadComponent: () => import('./pages/auth/pages/login').then(m => m.LoginComponent),
  },
];
