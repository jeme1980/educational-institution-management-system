import { ChangeDetectionStrategy, Component, OnInit, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';
import { ApiService, SubjectItem, TopicItem, SkillItem } from '../../../core/services/api.service';
import { UiButtonComponent } from '../../../shared/components/ui-button/ui-button.component';
import { UiInputComponent } from '../../../shared/components/input/ui-input.component';
import { UiSelectComponent } from '../../../shared/components/select/ui-select.component';
import { UiFormFieldComponent } from '../../../shared/components/form-field/ui-form-field.component';
import { UiModalComponent } from '../../../shared/components/ui-modal/ui-modal.component';

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-subjects',
  imports: [CommonModule, ReactiveFormsModule, MatIconModule, UiButtonComponent, UiInputComponent, UiSelectComponent, UiFormFieldComponent, UiModalComponent],
  templateUrl: './subjects.component.html',
  styleUrl: './subjects.component.css'
})
export class SubjectsComponent implements OnInit {
  apiService = inject(ApiService);
  fb = inject(FormBuilder);

  // State Signals
  selectedSubjectId = signal<string | null>(null);
  searchQuery = signal<string>('');
  statusFilter = signal<string>('all');
  isProcessing = signal<boolean>(false);
  toast = signal<{ message: string, type: 'success' | 'error' | 'info' } | null>(null);

  // Modal Signals
  showSubjectModal = signal<boolean>(false);
  isEditingSubject = signal<boolean>(false);
  selectedSubjectForEdit = signal<SubjectItem | null>(null);

  showTopicModal = signal<boolean>(false);
  isEditingTopic = signal<boolean>(false);
  selectedTopicForEdit = signal<TopicItem | null>(null);

  showSkillModal = signal<boolean>(false);
  isEditingSkill = signal<boolean>(false);
  selectedSkillForEdit = signal<SkillItem | null>(null);

  // Confirmation Overlay Signal
  confirmDeleteTarget = signal<{ type: 'subject' | 'topic' | 'skill', id: string, name: string } | null>(null);

  // Form Definitions
  subjectForm = this.fb.group({
    academicYearId: ['', [Validators.required]],
    nameAr: ['', [Validators.required]],
    nameHe: [''],
    isActive: [true],
    archivedAt: ['']
  });

  topicForm = this.fb.group({
    academicYearId: ['', [Validators.required]],
    subjectId: ['', [Validators.required]],
    gradeLevelId: ['', [Validators.required]],
    nameAr: ['', [Validators.required]],
    nameHe: [''],
    isActive: [true],
    archivedAt: ['']
  });

  skillForm = this.fb.group({
    academicYearId: ['', [Validators.required]],
    subjectId: ['', [Validators.required]],
    gradeLevelId: ['', [Validators.required]],
    nameAr: ['', [Validators.required]],
    nameHe: [''],
    isActive: [true],
    archivedAt: ['']
  });

  async ngOnInit() {
    this.isProcessing.set(true);
    try {
      await Promise.all([
        this.apiService.loadSubjects(),
        this.apiService.loadTopics(),
        this.apiService.loadSkills(),
        this.apiService.loadAcademicYears(),
        this.apiService.settingsApi.loadLookups()
      ]);
    } catch (e) {
      this.showToast('فشل تحميل بيانات المواد والمناهج الدراسية.', 'error');
    } finally {
      this.isProcessing.set(false);
    }
  }

  // Toast System Helper
  showToast(message: string, type: 'success' | 'error' | 'info' = 'success') {
    this.toast.set({ message, type });
    setTimeout(() => {
      if (this.toast()?.message === message) {
        this.toast.set(null);
      }
    }, 4000);
  }

  // Reset all filters easily
  resetFilters() {
    this.searchQuery.set('');
    this.statusFilter.set('all');
    this.showToast('تم إعادة تعيين مرشحات البحث بنجاح.', 'info');
  }

  // Get related elements
  getSubjectTopics(subjectId: string): TopicItem[] {
    const yearId = this.currentAcademicYearId();
    const allTopics = (this.apiService.topics() || []).filter(topic => !yearId || topic.academicYearId === yearId);
    return allTopics.filter(t => t.subjectId === subjectId);
  }

  getSubjectSkills(subjectId: string): SkillItem[] {
    const yearId = this.currentAcademicYearId();
    const allSkills = (this.apiService.skills() || []).filter(skill => !yearId || skill.academicYearId === yearId);
    return allSkills.filter(s => s.subjectId === subjectId);
  }

  currentAcademicYearId(): string {
    return this.apiService.selectedAcademicYearId()
      || this.apiService.academicYears().find(y => y.isCurrent)?.id
      || this.apiService.academicYears()[0]?.id
      || '';
  }


  // Dynamic color coding scheme based on the subject name.
  getSubjectColor(name: string) {
    const key = (name || '').toLowerCase();
    if (key.includes('math') || key.includes('رياض') || key.includes('حساب')) {
      return {
        bg: 'bg-sky-500',
        text: 'text-sky-600',
        lightBg: 'bg-sky-50',
        border: 'border-sky-100'
      };
    }
    if (key.includes('phys') || key.includes('chem') || key.includes('sci') || key.includes('فيز') || key.includes('كيم') || key.includes('علوم')) {
      return {
        bg: 'bg-indigo-500',
        text: 'text-indigo-600',
        lightBg: 'bg-indigo-50',
        border: 'border-indigo-100'
      };
    }
    if (key.includes('arab') || key.includes('عرب') || key.includes('إسلام') || key.includes('religion') || key.includes('دين')) {
      return {
        bg: 'bg-emerald-500',
        text: 'text-emerald-600',
        lightBg: 'bg-emerald-50',
        border: 'border-emerald-100'
      };
    }
    if (key.includes('eng') || key.includes('انج') || key.includes('hebr') || key.includes('عبر') || key.includes('lang') || key.includes('لغ')) {
      return {
        bg: 'bg-amber-500',
        text: 'text-amber-600',
        lightBg: 'bg-amber-50',
        border: 'border-amber-100'
      };
    }
    if (key.includes('comp') || key.includes('tech') || key.includes('برمج') || key.includes('تكنو') || key.includes('حاسوب') || key.includes('رقم')) {
      return {
        bg: 'bg-violet-500',
        text: 'text-violet-600',
        lightBg: 'bg-violet-50',
        border: 'border-violet-100'
      };
    }
    return {
      bg: 'bg-slate-500',
      text: 'text-slate-600',
      lightBg: 'bg-slate-50',
      border: 'border-slate-100'
    };
  }

  // Computed KPI Metrics
  totalSubjects = computed(() => this.apiService.subjects()?.length || 0);
  totalTopics = computed(() => this.apiService.topics()?.length || 0);
  totalSkills = computed(() => this.apiService.skills()?.length || 0);
  avgTopicsPerSubject = computed(() => {
    const sCount = this.totalSubjects();
    if (sCount === 0) return '0.0';
    return (this.totalTopics() / sCount).toFixed(1);
  });

  // Sophisticated search/filter logic matching topics/skills too!
  filteredSubjects = computed(() => {
    const academicYearId = this.currentAcademicYearId();
    const list = (this.apiService.subjects() || []).filter(subject => !academicYearId || subject.academicYearId === academicYearId);
    const term = this.searchQuery().trim().toLowerCase();
    const status = this.statusFilter();
    const allTopics = (this.apiService.topics() || []).filter(topic => !academicYearId || topic.academicYearId === academicYearId);
    const allSkills = (this.apiService.skills() || []).filter(skill => !academicYearId || skill.academicYearId === academicYearId);
    
    return list.filter(s => {
      // Direct subject match
      const nameMatch = (s.nameAr || '').toLowerCase().includes(term);
      const nameHeMatch = (s.nameHe || '').toLowerCase().includes(term);
      
      // Secondary curriculum topics search match
      const topicsOfSubject = allTopics.filter(t => t.subjectId === s.id);
      const topicsMatch = topicsOfSubject.some(t => 
        (t.nameAr || '').toLowerCase().includes(term) || 
        (t.nameHe || '').toLowerCase().includes(term)
      );
      
      // Secondary learning skills search match
      const skillsOfSubject = allSkills.filter(sk => sk.subjectId === s.id);
      const skillsMatch = skillsOfSubject.some(sk => 
        (sk.nameAr || '').toLowerCase().includes(term) ||
        (sk.nameHe || '').toLowerCase().includes(term)
      );
      
      const searchMatch = !term || nameMatch || nameHeMatch || topicsMatch || skillsMatch;
      
      // Active state filter
      const statusMatch = status === 'all' || 
                          (status === 'active' && s.isActive) || 
                          (status === 'inactive' && !s.isActive);
      
      return searchMatch && statusMatch;
    });
  });

  // Computed signal to track active detail subject
  selectedSubject = computed(() => {
    const list = this.filteredSubjects();
    const id = this.selectedSubjectId();
    if (!id) {
      return list[0] || null;
    }
    return list.find(s => s.id === id) || list[0] || null;
  });

  // Modal Handlers: Subjects
  openCreateSubjectModal() {
    this.subjectForm.reset({
      academicYearId: this.currentAcademicYearId(),
      nameAr: '',
      nameHe: '',
      isActive: true,
      archivedAt: ''
    });
    this.isEditingSubject.set(false);
    this.selectedSubjectForEdit.set(null);
    this.showSubjectModal.set(true);
  }

  openEditSubjectModal(subject: SubjectItem) {
    this.subjectForm.patchValue({
      academicYearId: subject.academicYearId,
      nameAr: subject.nameAr,
      nameHe: subject.nameHe || '',
      isActive: subject.isActive,
      archivedAt: subject.archivedAt ? subject.archivedAt.slice(0, 10) : ''
    });
    this.isEditingSubject.set(true);
    this.selectedSubjectForEdit.set(subject);
    this.showSubjectModal.set(true);
  }

  closeSubjectModal() {
    this.showSubjectModal.set(false);
  }

  async saveSubject() {
    if (this.subjectForm.invalid) {
      this.subjectForm.markAllAsTouched();
      return;
    }
    
    this.isProcessing.set(true);
    let success = false;
    
    try {
      const formValue = this.subjectForm.value;
      
      if (this.isEditingSubject() && this.selectedSubjectForEdit()) {
        const id = this.selectedSubjectForEdit()!.id;
        success = await this.apiService.updateSubject(id, formValue);
        if (success) {
          this.showToast('تم تحديث بيانات المادة التعليمية بنجاح.', 'success');
        }
      } else {
        success = await this.apiService.createSubject(formValue);
        if (success) {
          this.showToast('تم تسجيل المادة التعليمية الجديدة للمنهاج.', 'success');
        }
      }
    } catch (e) {
      this.showToast('حدث خطأ أثناء حفظ المادة الدراسية.', 'error');
    } finally {
      this.isProcessing.set(false);
      if (success) this.closeSubjectModal();
    }
  }

  // Modal Handlers: Topics
  openCreateTopicModal() {
    this.topicForm.reset({
      academicYearId: this.currentAcademicYearId(),
      subjectId: this.selectedSubject()?.id || '',
      gradeLevelId: '',
      nameAr: '',
      nameHe: '',
      isActive: true,
      archivedAt: ''
    });
    this.isEditingTopic.set(false);
    this.selectedTopicForEdit.set(null);
    this.showTopicModal.set(true);
  }

  openEditTopicModal(topic: TopicItem) {
    this.topicForm.patchValue({
      academicYearId: topic.academicYearId,
      subjectId: topic.subjectId,
      gradeLevelId: topic.gradeLevelId,
      nameAr: topic.nameAr,
      nameHe: topic.nameHe || '',
      isActive: topic.isActive,
      archivedAt: topic.archivedAt ? topic.archivedAt.slice(0, 10) : ''
    });
    this.isEditingTopic.set(true);
    this.selectedTopicForEdit.set(topic);
    this.showTopicModal.set(true);
  }

  closeTopicModal() {
    this.showTopicModal.set(false);
  }

  async saveTopic() {
    if (this.topicForm.invalid) {
      this.topicForm.markAllAsTouched();
      return;
    }

    this.isProcessing.set(true);
    let success = false;

    try {
      const formValue = this.topicForm.value;
      
      if (this.isEditingTopic() && this.selectedTopicForEdit()) {
        const id = this.selectedTopicForEdit()!.id;
        success = await this.apiService.updateTopic(id, formValue);
        if (success) {
          this.showToast('تم تعديل موضوع المنهاج بنجاح.', 'success');
        }
      } else {
        const activeSubject = this.selectedSubject();
        if (!activeSubject) {
          this.showToast('تنبيه: يجب اختيار المادة أولاً لتسجيل المواضيع.', 'error');
          return;
        }
        const topicData = {
          ...formValue,
          subjectId: activeSubject.id
        };
        success = await this.apiService.createTopic(topicData);
        if (success) {
          this.showToast('تم إدراج موضوع جديد في المنهاج الدراسي.', 'success');
        }
      }
    } catch (e) {
      this.showToast('فشل حفظ وتحديث موضوع المنهاج.', 'error');
    } finally {
      this.isProcessing.set(false);
      if (success) this.closeTopicModal();
    }
  }

  // Modal Handlers: Skills
  openCreateSkillModal() {
    this.skillForm.reset({
      academicYearId: this.currentAcademicYearId(),
      subjectId: this.selectedSubject()?.id || '',
      gradeLevelId: '',
      nameAr: '',
      nameHe: '',
      isActive: true,
      archivedAt: ''
    });
    this.isEditingSkill.set(false);
    this.selectedSkillForEdit.set(null);
    this.showSkillModal.set(true);
  }

  openEditSkillModal(skill: SkillItem) {
    this.skillForm.patchValue({
      academicYearId: skill.academicYearId,
      subjectId: skill.subjectId,
      gradeLevelId: skill.gradeLevelId,
      nameAr: skill.nameAr,
      nameHe: skill.nameHe || '',
      isActive: skill.isActive,
      archivedAt: skill.archivedAt ? skill.archivedAt.slice(0, 10) : ''
    });
    this.isEditingSkill.set(true);
    this.selectedSkillForEdit.set(skill);
    this.showSkillModal.set(true);
  }

  closeSkillModal() {
    this.showSkillModal.set(false);
  }

  async saveSkill() {
    if (this.skillForm.invalid) {
      this.skillForm.markAllAsTouched();
      return;
    }

    this.isProcessing.set(true);
    let success = false;

    try {
      const formValue = this.skillForm.value;
      
      if (this.isEditingSkill() && this.selectedSkillForEdit()) {
        const id = this.selectedSkillForEdit()!.id;
        success = await this.apiService.updateSkill(id, formValue);
        if (success) {
          this.showToast('تم تعديل المخرج والمهارة التعليمية بنجاح.', 'success');
        }
      } else {
        const activeSubject = this.selectedSubject();
        if (!activeSubject) {
          this.showToast('تنبيه: يجب اختيار المادة لتسجيل المخرجات.', 'error');
          return;
        }
        const skillData = {
          ...formValue,
          subjectId: activeSubject.id
        };
        success = await this.apiService.createSkill(skillData);
        if (success) {
          this.showToast('تم حفظ وإسناد المخرج التعليمي الجديد.', 'success');
        }
      }
    } catch (e) {
      this.showToast('فشل حفظ المخرجات والمهارات.', 'error');
    } finally {
      this.isProcessing.set(false);
      if (success) this.closeSkillModal();
    }
  }

  // Deletion Confirmation triggers
  confirmDelete(type: 'subject' | 'topic' | 'skill', id: string, name: string) {
    this.confirmDeleteTarget.set({ type, id, name });
  }

  async executeDelete() {
    const target = this.confirmDeleteTarget();
    if (!target) return;

    this.isProcessing.set(true);
    let success = false;

    try {
      if (target.type === 'subject') {
        success = await this.apiService.deleteSubject(target.id);
        if (success) {
          this.showToast(`تم حذف المادة الدراسية "${target.name}" بجميع متعلقاتها بنجاح.`, 'success');
          if (this.selectedSubjectId() === target.id) {
            this.selectedSubjectId.set(null);
          }
        }
      } else if (target.type === 'topic') {
        success = await this.apiService.deleteTopic(target.id);
        if (success) {
          this.showToast(`تم حذف الوحدة الدراسية "${target.name}" من المنهج.`, 'success');
        }
      } else if (target.type === 'skill') {
        success = await this.apiService.deleteSkill(target.id);
        if (success) {
          this.showToast(`تم حذف المهارة التعليمية "${target.name}" بنجاح.`, 'success');
        }
      }
    } catch (e) {
      this.showToast('فشل إتمام عملية الحذف المطلوبة.', 'error');
    } finally {
      this.isProcessing.set(false);
      this.confirmDeleteTarget.set(null);
    }
  }
}
