import { ChangeDetectionStrategy, Component, input, output, inject, signal, effect } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';
import { ApiService, Student } from '../../../core/services/api.service';
import { DetailTabType, StudentGuardian, MedicalProfile } from '../models/student.model';
import { StudentStateService } from '../services/student-state.service';
import { StudentGradesTable } from './student-grades-table';
import { StudentAttendance } from './student-attendance';
import { StudentInfo } from './student-info';

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-student-details-modal',
  imports: [
    CommonModule, 
    MatIconModule,
    StudentGradesTable,
    StudentAttendance,
    StudentInfo
  ],
  templateUrl: './student-details-modal.html',
})
export class StudentDetailsModal {
  apiService = inject(ApiService);
  private studentStateService = inject(StudentStateService);

  student = input<Student | null>(null);
  show = input<boolean>(false);
  activeTab = input<DetailTabType>('academic');

  closeModal = output<void>();
  tabChange = output<DetailTabType>();
  guardians = signal<StudentGuardian[]>([]);
  medicalProfile = signal<MedicalProfile | null>(null);
  isProfileLoading = signal(false);
  profileError = signal<string | null>(null);
  showGuardianForm = signal(false);
  editingGuardianId = signal<string | null>(null);
  guardianDraft = signal<any>({ relationTypeId: 'parent', isPrimaryContact: true, isFinancialResponsible: false, hasCustody: false, canPickup: false });
  medicalDraft = signal<MedicalProfile>({});
  editingMedical = signal(false);

  constructor() {
    effect(() => {
      const id = this.student()?.id;
      if (id) this.loadSensitiveProfiles(id);
    });
  }

  loadSensitiveProfiles(studentId = this.student()?.id) {
    if (!studentId) return;
    this.isProfileLoading.set(true);
    this.profileError.set(null);
    this.studentStateService.getStudentGuardians(studentId).subscribe({ next: (items) => this.guardians.set(items), error: (error) => this.profileError.set(error.message) });
    this.studentStateService.getStudentMedicalProfile(studentId).subscribe({
      next: (profile) => { this.medicalProfile.set(profile); this.medicalDraft.set({ ...profile }); this.isProfileLoading.set(false); },
      error: (error) => { this.profileError.set(error.message); this.isProfileLoading.set(false); },
    });
  }

  openGuardianCreate() {
    this.editingGuardianId.set(null);
    this.guardianDraft.set({ relationTypeId: 'parent', isPrimaryContact: this.guardians().length === 0, isFinancialResponsible: false, hasCustody: false, canPickup: false });
    this.showGuardianForm.set(true);
  }

  openGuardianEdit(link: StudentGuardian) { this.editingGuardianId.set(link.id); this.guardianDraft.set({ ...link.guardian, relationTypeId: link.relationTypeId, isPrimaryContact: link.isPrimaryContact, isFinancialResponsible: link.isFinancialResponsible, hasCustody: link.hasCustody, canPickup: link.canPickup }); this.showGuardianForm.set(true); }
  closeGuardianForm() { this.showGuardianForm.set(false); }
  updateGuardianField(field: string, value: any) { this.guardianDraft.update((draft) => ({ ...draft, [field]: value })); }
  saveGuardian() {
    const studentId = this.student()?.id;
    if (!studentId) return;
    const request = this.editingGuardianId() ? this.studentStateService.updateStudentGuardian(this.editingGuardianId()!, this.guardianDraft()) : this.studentStateService.createStudentGuardian(studentId, this.guardianDraft());
    request.subscribe({ next: () => { this.showGuardianForm.set(false); this.loadSensitiveProfiles(studentId); }, error: (error) => this.profileError.set(error.message) });
  }
  removeGuardian(link: StudentGuardian) {
    const studentId = this.student()?.id;
    if (!studentId || !window.confirm('هل تريد إزالة ارتباط ولي الأمر بهذا الطالب؟')) return;
    this.studentStateService.deleteStudentGuardian(studentId, link.id).subscribe({ next: () => this.loadSensitiveProfiles(studentId), error: (error) => this.profileError.set(error.message) });
  }
  updateMedicalField(field: string, value: any) { this.medicalDraft.update((draft) => ({ ...draft, [field]: value })); }
  saveMedicalProfile() {
    const studentId = this.student()?.id;
    if (!studentId) return;
    this.studentStateService.updateStudentMedicalProfile(studentId, this.medicalDraft()).subscribe({ next: (profile) => { this.medicalProfile.set(profile); this.editingMedical.set(false); }, error: (error) => this.profileError.set(error.message) });
  }

  getGenderIcon(genderId?: string): string {
    if (genderId === 'gnd-female' || genderId === 'female') return 'woman';
    return 'man';
  }

  formatDate(d?: string): string {
    if (!d) return 'غير حدد';
    try {
      return new Date(d).toISOString().split('T')[0];
    } catch {
      return d;
    }
  }

  getStatusLabel(statusId?: string): string {
    const lookupStatus = this.apiService.lookups()?.studentStatuses?.find((status: any) => status.id === statusId);
    if (lookupStatus?.nameAr) return lookupStatus.nameAr;

    switch (statusId) {
      case 'ACTIVE':
        return 'منتظم ومستمر';
      case 'GRADUATED':
        return 'متخرج';
      case 'SUSPENDED':
        return 'موقوف';
      case 'INACTIVE':
        return 'منقطع';
      default:
        return statusId || 'منتظم';
    }
  }

  getStatusClass(statusId?: string): string {
    const lookupStatus = this.apiService.lookups()?.studentStatuses?.find((status: any) => status.id === statusId);
    if (lookupStatus) {
      return lookupStatus.isActive === false
        ? 'px-2.5 py-1 rounded-full text-xs font-bold bg-rose-50 text-rose-800 border border-rose-200'
        : 'px-2.5 py-1 rounded-full text-xs font-bold bg-emerald-50 text-[#00236f] border border-emerald-200';
    }

    switch (statusId) {
      case 'ACTIVE':
        return 'px-2.5 py-1 rounded-full text-xs font-bold bg-emerald-50 text-[#00236f] border border-emerald-200';
      case 'GRADUATED':
        return 'px-2.5 py-1 rounded-full text-xs font-bold bg-blue-50 text-blue-800 border border-blue-200';
      case 'SUSPENDED':
        return 'px-2.5 py-1 rounded-full text-xs font-bold bg-amber-50 text-amber-800 border border-amber-200';
      case 'INACTIVE':
        return 'px-2.5 py-1 rounded-full text-xs font-bold bg-rose-50 text-rose-800 border border-rose-200';
      default:
        return 'px-2.5 py-1 rounded-full text-xs font-bold bg-emerald-50 text-[#00236f] border border-emerald-200';
    }
  }
}
