import { Injectable } from '@angular/core';
import { BaseApiService } from '../../../core/services/base-api.service';

export type AttendanceStatus = 'PRESENT' | 'ABSENT' | 'LATE' | 'EXCUSED';
export interface AttendanceRosterStudent { id: string; firstNameAr: string; lastNameAr: string; nationalId: string; studentEnrollmentId: string; classId: string; attendance: { id: string; status: AttendanceStatus; notes: string | null; date: string } | null; }

@Injectable({ providedIn: 'root' })
export class AttendanceApiService extends BaseApiService {
  private async readError(response: Response): Promise<string> { try { const body = await response.json(); return body?.error?.message || body?.error || `تعذر تنفيذ العملية (${response.status}).`; } catch { return `تعذر تنفيذ العملية (${response.status}).`; } }
  async loadRoster(date: string, target: { classId?: string; studyGroupId?: string }): Promise<{ students: AttendanceRosterStudent[]; error?: string }> {
    const params = new URLSearchParams({ date, ...(target.classId ? { classId: target.classId } : { studyGroupId: target.studyGroupId! }) });
    try { const response = await this.apiFetch(`/api/attendance/roster?${params}`); if (!response.ok) return { students: [], error: await this.readError(response) }; const body = await response.json(); return { students: body.students || [] }; } catch { return { students: [], error: 'تعذر تحميل قائمة الحضور.' }; }
  }
  async saveBatch(date: string, target: { classId?: string; studyGroupId?: string }, records: Array<{ studentEnrollmentId: string; status: AttendanceStatus; notes: string | null }>): Promise<{ ok: boolean; error?: string }> {
    try { const response = await this.apiFetch('/api/attendance/batch', { method: 'POST', headers: this.headers, body: JSON.stringify({ date, ...target, records }) }); if (response.ok) return { ok: true }; return { ok: false, error: await this.readError(response) }; } catch { return { ok: false, error: 'تعذر حفظ الحضور. حاول مرة أخرى.' }; }
  }
}
