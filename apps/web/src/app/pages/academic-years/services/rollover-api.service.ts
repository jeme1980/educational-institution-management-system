import { Injectable } from '@angular/core';
import { BaseApiService } from '../../../core/services/base-api.service';

export type RolloverAction = 'PROMOTE' | 'REPEAT' | 'GRADUATE' | 'SKIP' | null;
export interface RolloverYear { id: string; yearLabel: string; isCurrent: boolean; isClosed: boolean; archivedAt?: string | null; startDate: string; }
export interface ClassMapping { id: string; action: 'CREATE' | 'USE_EXISTING' | 'SKIP'; validationStatus: string; targetStageId?: string | null; targetGradeLevelId?: string | null; targetClassId?: string | null; targetNameAr?: string | null; targetNameHe?: string | null; targetStage?: { nameAr: string } | null; targetGradeLevel?: { nameAr: string } | null; targetParallelNumber?: number | null; sourceClass: { nameAr: string; parallelNumber: number; gradeLevelId: string; gradeLevel: { id: string; nameAr: string } }; }
export interface StudentDecision { id: string; action: RolloverAction; validationStatus: string; sourceEnrollment: { student?: { firstNameAr?: string; lastNameAr?: string }; classRoom: { nameAr: string; gradeLevelId: string; gradeLevel: { id: string; nameAr: string } } }; targetClassMapping?: Pick<ClassMapping, 'id' | 'action' | 'validationStatus' | 'targetGradeLevelId' | 'targetGradeLevel' | 'targetParallelNumber'> | null; }
export interface RolloverDraft { operation: { id: string; status: string }; sourceYear: RolloverYear; targetYear: RolloverYear; classMappings: ClassMapping[]; dependencies: Pick<PreviewResult, 'subjects' | 'specializations' | 'staffAssignments' | 'topics' | 'skills' | 'studyGroups'>; studentDecisions: { summary: Record<string, number>; items: StudentDecision[] }; readiness: { canExecute: boolean; blockers: string[]; warnings: string[]; targetPeriodsReady: boolean; }; }
export interface PreviewResult { readiness: { blockers: string[]; warnings: string[] }; classes: { summary: Record<string, number> }; subjects: { summary: Record<string, number> }; specializations: { summary: Record<string, number>; sourceBasis: string }; staffAssignments: { summary: Record<string, number> }; students: { summary: Record<string, number> }; topics: { sourceCount: number }; skills: { sourceCount: number }; studyGroups: { sourceCount: number }; }
export interface CreateDraftResponse { operation?: { id: string }; code?: string; existingRolloverId?: string; error?: string; }

@Injectable({ providedIn: 'root' })
export class RolloverApiService extends BaseApiService {
  private async request<T>(path: string, options?: RequestInit): Promise<{ status: number; body: T | null }> {
    const response = await this.apiFetch(path, options);
    const contentType = response.headers.get('content-type') || '';
    if (!contentType.includes('application/json')) return { status: response.status, body: null };
    try { return { status: response.status, body: await response.json() as T }; }
    catch { return { status: response.status, body: null }; }
  }
  preview(sourceAcademicYearId: string, targetAcademicYearId: string) { return this.request<PreviewResult>('/api/academic-years/rollover/preview', { method: 'POST', body: JSON.stringify({ sourceAcademicYearId, targetAcademicYearId }) }); }
  createDraft(sourceAcademicYearId: string, targetAcademicYearId: string) { return this.request<CreateDraftResponse>('/api/academic-years/rollover', { method: 'POST', body: JSON.stringify({ sourceAcademicYearId, targetAcademicYearId }) }); }
  getDraft(id: string) { return this.request<RolloverDraft>(`/api/academic-years/rollover/${id}`); }
  patchMapping(rolloverId: string, mappingId: string, body: Record<string, unknown>) { return this.request(`/api/academic-years/rollover/${rolloverId}/classes/${mappingId}`, { method: 'PATCH', body: JSON.stringify(body) }); }
  patchDecision(rolloverId: string, decisionId: string, body: Record<string, unknown>) { return this.request(`/api/academic-years/rollover/${rolloverId}/students/${decisionId}`, { method: 'PATCH', body: JSON.stringify(body) }); }
  patchDecisions(rolloverId: string, decisionIds: string[], body: Record<string, unknown>) { return this.request(`/api/academic-years/rollover/${rolloverId}/students`, { method: 'PATCH', body: JSON.stringify({ decisionIds, ...body }) }); }
}
