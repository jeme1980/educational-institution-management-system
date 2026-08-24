import { Injectable, inject } from '@angular/core';
import { BaseApiService } from './base-api.service';
import { StudentsApiService } from './students-api.service';
import { ExamsApiService } from './exams-api.service';
import { UsersApiService } from './users-api.service';
import { ClassesApiService } from './classes-api.service';
import { SubjectsApiService } from './subjects-api.service';
import { SettingsApiService } from './settings-api.service';

export * from '../models/api.models';

@Injectable({
  providedIn: 'root',
})
export class ApiService extends BaseApiService {
  public studentsApi = inject(StudentsApiService);
  public examsApi = inject(ExamsApiService);
  public usersApi = inject(UsersApiService);
  public classesApi = inject(ClassesApiService);
  public subjectsApi = inject(SubjectsApiService);
  public settingsApi = inject(SettingsApiService);

  // Backward-compatible signal accessors
  get stats() { return this.settingsApi.stats; }
  get dashboardError() { return this.settingsApi.dashboardError; }
  get students() { return this.studentsApi.students; }
  get studentsTotal() { return this.studentsApi.studentsTotal; }
  get staff() { return this.usersApi.staff; }
  get staffAssignments() { return this.usersApi.staffAssignments; }
  get staffDevelopments() { return this.usersApi.staffDevelopments; }
  get jobRoles() { return this.usersApi.jobRoles; }
  get academicYears() { return this.settingsApi.academicYears; }
  get academicPeriods() { return this.settingsApi.academicPeriods; }
  get classes() { return this.classesApi.classes; }
  get subjects() { return this.subjectsApi.subjects; }
  get topics() { return this.subjectsApi.topics; }
  get skills() { return this.subjectsApi.skills; }
  get exams() { return this.examsApi.exams; }
  get lookups() { return this.settingsApi.lookups; }
  get publicLookups() { return this.settingsApi.publicLookups; }
  get languages() { return this.settingsApi.languages; }
  get appState() { return this.settingsApi.appState; }
  get regions() { return this.settingsApi.regions; }
  get educationTypes() { return this.settingsApi.educationTypes; }
  get institution() { return this.settingsApi.institution; }
  get institutions() { return this.settingsApi.institutions; }
  get towns() { return this.settingsApi.towns; }
  get educationStages() { return this.settingsApi.educationStages; }
  get gradeLevels() { return this.settingsApi.gradeLevels; }
  get classTypes() { return this.settingsApi.classTypes; }
  get compositionTypes() { return this.settingsApi.compositionTypes; }
  get enrollments() { return this.studentsApi.enrollments; }
  get studyGroups() { return this.classesApi.studyGroups; }
  get examTypes() { return this.examsApi.examTypes; }
  get examStatuses() { return this.examsApi.examStatuses; }
  get questionTypes() { return this.examsApi.questionTypes; }
  get questionSaveError() { return this.examsApi.questionSaveError; }
  get questionLoadError() { return this.examsApi.questionLoadError; }

  // Context syncing
  setSelectedInstitutionId(val: string | null) {
    this.selectedInstitutionId.set(val);
    this.studentsApi.selectedInstitutionId.set(val);
    this.examsApi.selectedInstitutionId.set(val);
    this.usersApi.selectedInstitutionId.set(val);
    this.classesApi.selectedInstitutionId.set(val);
    this.subjectsApi.selectedInstitutionId.set(val);
    this.settingsApi.selectedInstitutionId.set(val);
  }

  setSelectedAcademicYearId(val: string | null) {
    this.selectedAcademicYearId.set(val);
    this.studentsApi.selectedAcademicYearId.set(val);
    this.examsApi.selectedAcademicYearId.set(val);
    this.usersApi.selectedAcademicYearId.set(val);
    this.classesApi.selectedAcademicYearId.set(val);
    this.subjectsApi.selectedAcademicYearId.set(val);
    this.settingsApi.selectedAcademicYearId.set(val);
  }

  async loadCurrentContextData() {
    await Promise.all([
      this.loadDashboardStats(),
      this.loadStudents(),
      this.loadStaff(),
      this.loadClasses(),
      this.loadStudyGroups(),
      this.loadEnrollments(),
      this.loadStaffAssignments(),
      this.loadExams(),
      this.loadSubjects(),
      this.loadTopics(),
      this.loadSkills(),
      this.loadTowns(),
      this.loadInstitutions(),
    ]);
  }

  // Dashboard & Lookups
  loadLookups() { return this.settingsApi.loadLookups(); }
  loadPublicLookups() { return this.settingsApi.loadPublicLookups(); }
  createPublicLookup(table: string, data: Record<string, unknown>) { return this.settingsApi.createPublicLookup(table, data); }
  updatePublicLookup(table: string, id: string, data: Record<string, unknown>) { return this.settingsApi.updatePublicLookup(table, id, data); }
  deletePublicLookup(table: string, id: string) { return this.settingsApi.deletePublicLookup(table, id); }
  loadDashboardStats() { return this.settingsApi.loadDashboardStats(); }

  // Students & Enrollments
  loadStudents(search = '') { return this.studentsApi.loadStudents(search); }
  loadAllStudents(search = '') { return this.studentsApi.loadAllStudents(search); }
  createStudent(studentData: any) { return this.studentsApi.createStudent(studentData); }
  updateStudent(id: string, studentData: any) { return this.studentsApi.updateStudent(id, studentData); }
  deleteStudent(id: string) { return this.studentsApi.deleteStudent(id); }
  loadEnrollments() { return this.studentsApi.loadEnrollments(); }
  createEnrollment(data: any) { return this.studentsApi.createEnrollment(data); }
  updateEnrollment(id: string, data: any) { return this.studentsApi.updateEnrollment(id, data); }
  deleteEnrollment(id: string) { return this.studentsApi.deleteEnrollment(id); }

  // Staff & Job Roles
  loadStaff() { return this.usersApi.loadStaff(); }
  createStaff(staffData: any) { return this.usersApi.createStaff(staffData); }
  updateStaff(id: string, staffData: any) { return this.usersApi.updateStaff(id, staffData); }
  deleteStaff(id: string) { return this.usersApi.deleteStaff(id); }
  loadStaffDevelopments() { return this.usersApi.loadStaffDevelopments(); }
  createStaffDevelopment(data: any) { return this.usersApi.createStaffDevelopment(data); }
  updateStaffDevelopment(id: string, data: any) { return this.usersApi.updateStaffDevelopment(id, data); }
  deleteStaffDevelopment(id: string) { return this.usersApi.deleteStaffDevelopment(id); }
  loadJobRoles() { return this.usersApi.loadJobRoles(); }
  createJobRole(jobRoleData: any) { return this.usersApi.createJobRole(jobRoleData); }
  updateJobRole(id: string, jobRoleData: any) { return this.usersApi.updateJobRole(id, jobRoleData); }
  deleteJobRole(id: string) { return this.usersApi.deleteJobRole(id); }
  loadStaffAssignments() { return this.usersApi.loadStaffAssignments(); }
  createStaffAssignment(data: any) { return this.usersApi.createStaffAssignment(data); }
  updateStaffAssignment(id: string, data: any) { return this.usersApi.updateStaffAssignment(id, data); }
  deleteStaffAssignment(id: string) { return this.usersApi.deleteStaffAssignment(id); }

  // Academic Years & Periods
  loadAcademicYears() { return this.settingsApi.loadAcademicYears(); }
  createAcademicYear(data: any) { return this.settingsApi.createAcademicYear(data); }
  updateAcademicYear(id: string, data: any) { return this.settingsApi.updateAcademicYear(id, data); }
  deleteAcademicYear(id: string) { return this.settingsApi.deleteAcademicYear(id); }
  archiveAcademicYear(id: string) { return this.settingsApi.archiveAcademicYear(id); }
  loadAcademicPeriods() { return this.settingsApi.loadAcademicPeriods(); }
  createAcademicPeriod(data: any) { return this.settingsApi.createAcademicPeriod(data); }
  updateAcademicPeriod(id: string, data: any) { return this.settingsApi.updateAcademicPeriod(id, data); }
  deleteAcademicPeriod(id: string) { return this.settingsApi.deleteAcademicPeriod(id); }

  // Classes & Study Groups
  loadClasses() { return this.classesApi.loadClasses(); }
  createClass(classData: any) { return this.classesApi.createClass(classData); }
  updateClass(id: string, classData: any) { return this.classesApi.updateClass(id, classData); }
  deleteClass(id: string) { return this.classesApi.deleteClass(id); }
  loadStudyGroups(includeArchived = false) { return this.classesApi.loadStudyGroups(includeArchived); }
  createStudyGroup(data: any) { return this.classesApi.createStudyGroup(data); }
  updateStudyGroup(id: string, data: any) { return this.classesApi.updateStudyGroup(id, data); }
  deleteStudyGroup(id: string) { return this.classesApi.deleteStudyGroup(id); }
  restoreStudyGroup(id: string) { return this.classesApi.restoreStudyGroup(id); }
  loadGroupMembers(groupId: string) { return this.classesApi.loadGroupMembers(groupId); }
  addGroupMember(groupId: string, enrollmentId: string) { return this.classesApi.addGroupMember(groupId, enrollmentId); }
  removeGroupMember(groupId: string, memberId: string) { return this.classesApi.removeGroupMember(groupId, memberId); }

  // Subjects, Topics, Skills
  loadSubjects() { return this.subjectsApi.loadSubjects(); }
  createSubject(subjectData: any) { return this.subjectsApi.createSubject(subjectData); }
  updateSubject(id: string, subjectData: any) { return this.subjectsApi.updateSubject(id, subjectData); }
  deleteSubject(id: string) { return this.subjectsApi.deleteSubject(id); }
  loadTopics() { return this.subjectsApi.loadTopics(); }
  createTopic(topicData: any) { return this.subjectsApi.createTopic(topicData); }
  updateTopic(id: string, topicData: any) { return this.subjectsApi.updateTopic(id, topicData); }
  deleteTopic(id: string) { return this.subjectsApi.deleteTopic(id); }
  loadSkills() { return this.subjectsApi.loadSkills(); }
  createSkill(skillData: any) { return this.subjectsApi.createSkill(skillData); }
  updateSkill(id: string, skillData: any) { return this.subjectsApi.updateSkill(id, skillData); }
  deleteSkill(id: string) { return this.subjectsApi.deleteSkill(id); }

  // Exams
  loadExams() { return this.examsApi.loadExams(); }
  createExam(examData: any) { return this.examsApi.createExam(examData); }
  updateExam(id: string, examData: any) { return this.examsApi.updateExam(id, examData); }
  loadExam(id: string) { return this.examsApi.loadExam(id); }
  saveExamBuilder(id: string, payload: any) { return this.examsApi.saveExamBuilder(id, payload); }
  deleteExam(id: string) { return this.examsApi.deleteExam(id); }
  loadExamResults(examId: string) { return this.examsApi.loadExamResults(examId); }
  loadExamAnalysis(examId: string) { return this.examsApi.loadExamAnalysis(examId); }
  loadProgressTracking(params: { academicYearId: string; subjectId: string; studyGroupId: string }) { return this.examsApi.loadProgressTracking(params); }
  loadProgressTrackingStudyGroups(params: { academicYearId: string; subjectId: string }) { return this.examsApi.loadProgressTrackingStudyGroups(params); }
  loadProgressTrackingDimensions(params: { academicYearId: string; subjectId: string; studyGroupId: string; dimension: 'skill' | 'topic'; dimensionId?: string }) { return this.examsApi.loadProgressTrackingDimensions(params); }
  loadStudentProgressTracking(params: { academicYearId: string; subjectId: string; studyGroupId: string; studentId: string }) { return this.examsApi.loadStudentProgressTracking(params); }
  saveExamResults(examId: string, results: any[]) { return this.examsApi.saveExamResults(examId, results); }
  importExamResults(examId: string, file: File) { return this.examsApi.importExamResults(examId, file); }
  loadExamTypes() { return this.examsApi.loadExamTypes(); }
  createExamType(data: any) { return this.examsApi.createExamType(data); }
  updateExamType(id: string, data: any) { return this.examsApi.updateExamType(id, data); }
  deleteExamType(id: string) { return this.examsApi.deleteExamType(id); }
  loadExamStatuses() { return this.examsApi.loadExamStatuses(); }
  loadQuestionTypes() { return this.examsApi.loadQuestionTypes(); }
  createQuestionType(data: any) { return this.examsApi.createQuestionType(data); }
  updateQuestionType(id: string, data: any) { return this.examsApi.updateQuestionType(id, data); }
  deleteQuestionType(id: string) { return this.examsApi.deleteQuestionType(id); }
  loadExamQuestions(examId: string) { return this.examsApi.loadExamQuestions(examId); }
  loadExamQuestionContext(examId: string) { return this.examsApi.loadExamQuestionContext(examId); }
  saveExamQuestions(examId: string, questions: any[]) { return this.examsApi.saveExamQuestions(examId, questions); }
  loadExamStudyGroups(examId: string) { return this.examsApi.loadExamStudyGroups(examId); }
  saveExamStudyGroups(examId: string, studyGroupIds: string[]) { return this.examsApi.saveExamStudyGroups(examId, studyGroupIds); }
  loadGroupExamResults(examId: string, studyGroupId: string) { return this.examsApi.loadGroupExamResults(examId, studyGroupId); }
  saveGroupExamResults(examId: string, studyGroupId: string, examStudyGroupId: string, results: any[]) { return this.examsApi.saveGroupExamResults(examId, studyGroupId, examStudyGroupId, results); }

  // Other Settings
  loadLanguages() { return this.settingsApi.loadLanguages(); }
  createLanguage(langData: any) { return this.settingsApi.createLanguage(langData); }
  updateLanguage(code: string, langData: any) { return this.settingsApi.updateLanguage(code, langData); }
  deleteLanguage(code: string) { return this.settingsApi.deleteLanguage(code); }
  loadAppState() { return this.settingsApi.loadAppState(); }
  updateAppState(stateData: any) { return this.settingsApi.updateAppState(stateData); }
  loadRegions() { return this.settingsApi.loadRegions(); }
  createRegion(regionData: any) { return this.settingsApi.createRegion(regionData); }
  updateRegion(code: string, regionData: any) { return this.settingsApi.updateRegion(code, regionData); }
  deleteRegion(code: string) { return this.settingsApi.deleteRegion(code); }
  loadInstitutions() { return this.settingsApi.loadInstitutions(); }
  loadInstitution() { return this.settingsApi.loadInstitution(); }
  loadInstitutionProfile() { return this.settingsApi.loadInstitutionProfile(); }
  updateInstitutionProfile(data: Record<string, unknown>) { return this.settingsApi.updateInstitutionProfile(data); }
  setCurrentAcademicYear(id: string) { return this.settingsApi.setCurrentAcademicYear(id); }
  createInstitution(instData: any) { return this.settingsApi.createInstitution(instData); }
  updateInstitution(id: string, instData: any) { return this.settingsApi.updateInstitution(id, instData); }
  deleteInstitution(id: string) { return this.settingsApi.deleteInstitution(id); }
  loadEducationTypes() { return this.settingsApi.loadEducationTypes(); }
  createEducationType(data: any) { return this.settingsApi.createEducationType(data); }
  updateEducationType(code: string, data: any) { return this.settingsApi.updateEducationType(code, data); }
  deleteEducationType(code: string) { return this.settingsApi.deleteEducationType(code); }

  // Towns
  loadTowns() { return this.settingsApi.loadTowns(); }
  createTown(data: { nameAr: string; nameHe?: string | null }) { return this.settingsApi.createTown(data); }
  updateTown(id: string, data: { nameAr: string; nameHe?: string | null }) { return this.settingsApi.updateTown(id, data); }
  deleteTown(id: string) { return this.settingsApi.deleteTown(id); }
}
