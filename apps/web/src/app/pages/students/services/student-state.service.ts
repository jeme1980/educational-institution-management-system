import { Injectable, inject, signal } from '@angular/core';
import { ApiService, Student } from '../../../core/services/api.service';
import { Grade, Attendance, StudentGuardian, MedicalProfile } from '../models/student.model';
import { Observable, from, throwError, of } from 'rxjs';
import { catchError, shareReplay, switchMap, tap, map } from 'rxjs/operators';

export interface StudentPageOptions {
  page?: number;
  pageSize?: number;
  classId?: string;
  statusId?: string;
  genderId?: string;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

@Injectable({
  providedIn: 'root',
})
export class StudentStateService {
  private apiService = inject(ApiService);

  // Link to the main students signal from ApiService to keep global state in perfect sync
  students = this.apiService.students;
  isLoading = this.apiService.isLoading;
  totalItems = signal(0);
  currentPage = signal(1);
  pageSize = signal(25);
  totalPages = signal(1);
  private studentsRequestVersion = 0;

  // In-memory caches for student-specific grades and attendance
  private gradesCache = new Map<string, Observable<Grade[]>>();
  private attendanceCache = new Map<string, Observable<Attendance[]>>();

  /**
   * Loads the student list into the shared state signal.
   * Can be force-refreshed to clear caching.
   */
  loadStudents(search = '', forceRefresh = false, options: StudentPageOptions = {}): Observable<Student[]> {
    if (forceRefresh) {
      this.clearAllCaches();
    }
    
    const requestVersion = ++this.studentsRequestVersion;
    this.isLoading.set(true);
    const params = new URLSearchParams({
      page: String(options.page ?? 1),
      limit: String(options.pageSize ?? 25),
    });
    if (search) params.set('search', search);
    if (options.classId) params.set('classId', options.classId);
    if (options.statusId) params.set('statusId', options.statusId);
    if (options.genderId) params.set('genderId', options.genderId);
    if (options.sortBy) params.set('sortBy', options.sortBy);
    if (options.sortOrder) params.set('sortDirection', options.sortOrder);
    const url = `/api/students?${params.toString()}`;

    return from(this.apiService.apiFetch(url, { headers: this.getHeaders() })).pipe(
      switchMap((res) => {
        if (!res.ok) throw new Error('Failed to fetch students list');
        return from(res.json() as Promise<Student[] | {
          data?: Student[];
          students?: Student[];
          page?: number;
          limit?: number;
          total?: number;
          totalItems?: number;
          totalPages?: number;
          pagination?: { page?: number; limit?: number; total?: number; totalItems?: number; totalPages?: number };
        }>);
      }),
      map((payload) => {
        if (requestVersion !== this.studentsRequestVersion) return Array.isArray(payload) ? payload : (Array.isArray(payload.data) ? payload.data : (Array.isArray(payload.students) ? payload.students : []));
        if (Array.isArray(payload)) {
          this.totalItems.set(payload.length);
          this.currentPage.set(options.page ?? 1);
          this.pageSize.set(options.pageSize ?? 25);
          this.totalPages.set(1);
          return payload;
        }
        const pagination = payload.pagination;
        const list = Array.isArray(payload.data) ? payload.data : (Array.isArray(payload.students) ? payload.students : []);
        const total = pagination?.total ?? pagination?.totalItems ?? payload.total ?? payload.totalItems ?? list.length;
        const page = pagination?.page ?? payload.page ?? options.page ?? 1;
        const limit = pagination?.limit ?? payload.limit ?? options.pageSize ?? 25;
        const reportedPages = Number(pagination?.totalPages ?? payload.totalPages ?? 0);
        const totalPages = Math.max(reportedPages, Math.max(1, Math.ceil(Number(total) / Number(limit))));
        this.totalItems.set(Number(total));
        this.currentPage.set(Number(page));
        this.pageSize.set(Number(limit));
        this.totalPages.set(Number(totalPages));
        return list;
      }),
      tap((data: Student[]) => {
        if (requestVersion !== this.studentsRequestVersion) return;
        this.students.set(data);
        this.apiService.studentsTotal.set(this.totalItems());
        this.isLoading.set(false);
      }),
      catchError((error) => {
        console.error('Error fetching students:', error);
        if (requestVersion === this.studentsRequestVersion) this.isLoading.set(false);
        return throwError(() => new Error('تعذر تحميل قائمة الطلاب. الرجاء المحاولة لاحقاً.'));
      })
    );
  }

  /**
   * Fetches a single student's details, returning Observable<Student>
   */
  getStudentDetails(studentId: string, forceRefresh = false): Observable<Student> {
    const cachedStudent = this.students().find(s => s.id === studentId);
    if (cachedStudent && !forceRefresh) {
      return of(cachedStudent);
    }

    return from(this.apiService.apiFetch(`/api/students/${studentId}`, { headers: this.getHeaders() })).pipe(
      switchMap((res) => {
        if (!res.ok) throw new Error(`Failed to fetch student details for ID: ${studentId}`);
        return from(res.json() as Promise<Student>);
      }),
      tap((data) => {
        const index = this.students().findIndex(s => s.id === studentId);
        if (index !== -1) {
          const list = [...this.students()];
          list[index] = data;
          this.students.set(list);
        }
      }),
      catchError((error) => {
        console.error(`Error fetching student ${studentId} details:`, error);
        return throwError(() => new Error('تعذر تحميل تفاصيل الطالب.'));
      })
    );
  }

  /**
   * Fetches the grades for a specific student with in-memory caching.
   * Navigating between tabs will read from the cache and prevent duplicate GET requests.
   */
  getStudentGrades(studentId: string, forceRefresh = false): Observable<Grade[]> {
    if (forceRefresh) {
      this.gradesCache.delete(studentId);
    }

    if (!this.gradesCache.has(studentId)) {
      const gradesObservable = from(
        this.apiService.apiFetch(`/api/students/${studentId}/grades`, { headers: this.getHeaders() })
      ).pipe(
        switchMap((res) => {
          if (!res.ok) throw new Error('Failed to fetch grades');
          return from(res.json() as Promise<Grade[]>);
        }),
        catchError((error) => {
          console.error(`Error fetching grades for student ${studentId}:`, error);
          return throwError(() => new Error('فشل تحميل درجات الطالب.'));
        }),
        shareReplay(1) // Cache the result of this HTTP call in memory
      );

      this.gradesCache.set(studentId, gradesObservable);
    }

    return this.gradesCache.get(studentId)!;
  }

  /**
   * Fetches attendance logs for a specific student with in-memory caching.
   * Navigating between tabs will read from the cache and prevent duplicate GET requests.
   */
  getStudentAttendance(studentId: string, forceRefresh = false): Observable<Attendance[]> {
    if (forceRefresh) {
      this.attendanceCache.delete(studentId);
    }

    if (!this.attendanceCache.has(studentId)) {
      const attendanceObservable = from(
        this.apiService.apiFetch(`/api/students/${studentId}/attendance`, { headers: this.getHeaders() })
      ).pipe(
        switchMap((res) => {
          if (!res.ok) throw new Error('Failed to fetch attendance');
          return from(res.json() as Promise<Attendance[]>);
        }),
        catchError((error) => {
          console.error(`Error fetching attendance for student ${studentId}:`, error);
          return throwError(() => new Error('فشل تحميل غيابات وحضور الطالب.'));
        }),
        shareReplay(1) // Cache the result of this HTTP call in memory
      );

      this.attendanceCache.set(studentId, attendanceObservable);
    }

    return this.attendanceCache.get(studentId)!;
  }

  createStudentAttendance(studentId: string, data: { attendanceDate: string; status: string; notes?: string | null }): Observable<Attendance> {
    return from(this.apiService.apiFetch(`/api/students/${studentId}/attendance`, {
      method: 'POST', headers: this.getHeaders(), body: JSON.stringify(data),
    })).pipe(
      switchMap((res) => res.ok ? from(res.json() as Promise<Attendance>) : from(res.json().catch(() => ({}))).pipe(switchMap((body: any) => throwError(() => new Error(body?.error || 'تعذر تسجيل الحضور.'))))),
      tap(() => this.attendanceCache.delete(studentId)),
    );
  }

  updateStudentAttendance(id: string, data: { attendanceDate: string; status: string; notes?: string | null }): Observable<Attendance> {
    return from(this.apiService.apiFetch(`/api/attendance/${id}`, {
      method: 'PUT', headers: this.getHeaders(), body: JSON.stringify(data),
    })).pipe(
      switchMap((res) => res.ok ? from(res.json() as Promise<Attendance>) : from(res.json().catch(() => ({}))).pipe(switchMap((body: any) => throwError(() => new Error(body?.error || 'تعذر تعديل سجل الحضور.'))))),
    );
  }

  deleteStudentAttendance(id: string): Observable<boolean> {
    return from(this.apiService.apiFetch(`/api/attendance/${id}`, {
      method: 'DELETE', headers: this.getHeaders(),
    })).pipe(
      switchMap((res) => res.ok ? of(true) : from(res.json().catch(() => ({}))).pipe(switchMap((body: any) => throwError(() => new Error(body?.error || 'تعذر حذف سجل الحضور.'))))),
    );
  }

  getStudentGuardians(studentId: string): Observable<StudentGuardian[]> {
    return from(this.apiService.apiFetch(`/api/students/${studentId}/guardians`, { headers: this.getHeaders() })).pipe(
      switchMap((res) => res.ok ? from(res.json() as Promise<StudentGuardian[]>) : throwError(() => new Error('تعذر تحميل بيانات أولياء الأمور.'))),
    );
  }

  createStudentGuardian(studentId: string, data: any): Observable<StudentGuardian> {
    return from(this.apiService.apiFetch(`/api/students/${studentId}/guardians`, { method: 'POST', headers: this.getHeaders(), body: JSON.stringify(data) })).pipe(
      switchMap((res) => res.ok ? from(res.json() as Promise<StudentGuardian>) : from(res.json().catch(() => ({}))).pipe(switchMap((body: any) => throwError(() => new Error(body?.error || 'تعذر إضافة ولي الأمر.'))))),
    );
  }

  updateStudentGuardian(linkId: string, data: any): Observable<StudentGuardian> {
    return from(this.apiService.apiFetch(`/api/student-guardians/${linkId}`, { method: 'PUT', headers: this.getHeaders(), body: JSON.stringify(data) })).pipe(
      switchMap((res) => res.ok ? from(res.json() as Promise<StudentGuardian>) : from(res.json().catch(() => ({}))).pipe(switchMap((body: any) => throwError(() => new Error(body?.error || 'تعذر تعديل ولي الأمر.'))))),
    );
  }

  deleteStudentGuardian(studentId: string, linkId: string): Observable<boolean> {
    return from(this.apiService.apiFetch(`/api/students/${studentId}/guardians/${linkId}`, { method: 'DELETE', headers: this.getHeaders() })).pipe(
      switchMap((res) => res.ok ? of(true) : throwError(() => new Error('تعذر إزالة ارتباط ولي الأمر.'))),
    );
  }

  getStudentMedicalProfile(studentId: string): Observable<MedicalProfile | null> {
    return from(this.apiService.apiFetch(`/api/students/${studentId}/medical-profile`, { headers: this.getHeaders() })).pipe(
      switchMap((res) => res.ok ? from(res.json() as Promise<MedicalProfile | null>) : throwError(() => new Error('تعذر تحميل الملف الطبي.'))),
    );
  }

  updateStudentMedicalProfile(studentId: string, data: MedicalProfile): Observable<MedicalProfile> {
    return from(this.apiService.apiFetch(`/api/students/${studentId}/medical-profile`, { method: 'PUT', headers: this.getHeaders(), body: JSON.stringify(data) })).pipe(
      switchMap((res) => res.ok ? from(res.json() as Promise<MedicalProfile>) : from(res.json().catch(() => ({}))).pipe(switchMap((body: any) => throwError(() => new Error(body?.error || 'تعذر حفظ الملف الطبي.'))))),
    );
  }

  /**
   * Creates a new student and clears the list caches to guarantee fresh data on next read.
   */
  createStudent(studentData: any): Observable<boolean> {
    return from(
      this.apiService.apiFetch('/api/students', {
        method: 'POST',
        headers: this.getHeaders(),
        body: JSON.stringify(studentData),
      })
    ).pipe(
      switchMap((res) => {
        if (res.ok) {
          this.forceRefresh();
          this.apiService.loadDashboardStats();
          return of(true);
        }
        return from(res.json().catch(() => ({}))).pipe(
          switchMap((body: any) => throwError(() => new Error(body?.error || 'فشل إضافة الطالب الجديد.')))
        );
      }),
      catchError((error) => {
        console.error('Error creating student:', error);
        if (error?.message && error.message !== 'Failed to fetch') {
          return throwError(() => new Error(error.message));
        }
        return throwError(() => new Error('فشل إضافة الطالب الجديد.'));
      })
    );
  }

  /**
   * Updates an existing student's profile and invalidates all caches for this student.
   */
  updateStudent(id: string, studentData: any): Observable<boolean> {
    return from(
      this.apiService.apiFetch(`/api/students/${id}`, {
        method: 'PUT',
        headers: this.getHeaders(),
        body: JSON.stringify(studentData),
      })
    ).pipe(
      map((res) => {
        if (res.ok) {
          this.forceRefreshStudent(id);
          return true;
        }
        return false;
      }),
      catchError((error) => {
        console.error(`Error updating student ${id}:`, error);
        return throwError(() => new Error('فشل تحديث بيانات الطالب.'));
      })
    );
  }

  /**
   * Deletes a student and forces a refresh across all caches and lists.
   */
  deleteStudent(id: string): Observable<boolean> {
    return from(
      this.apiService.apiFetch(`/api/students/${id}`, {
        method: 'DELETE',
        headers: this.getHeaders(),
      })
    ).pipe(
      map((res) => {
        if (res.ok) {
          this.forceRefresh();
          this.apiService.loadDashboardStats();
          return true;
        }
        return false;
      }),
      catchError((error) => {
        console.error(`Error deleting student ${id}:`, error);
        return throwError(() => new Error('فشل حذف الطالب من السجل.'));
      })
    );
  }

  /**
   * Forces a refresh for a single student's caches.
   */
  forceRefreshStudent(studentId: string): void {
    this.gradesCache.delete(studentId);
    this.attendanceCache.delete(studentId);
    this.apiService.loadStudents();
  }

  /**
   * Clears all in-memory caches and re-fetches fresh student lists.
   */
  forceRefresh(): void {
    this.clearAllCaches();
    this.apiService.loadStudents();
  }

  /**
   * Helper to clear in-memory maps.
   */
  private clearAllCaches(): void {
    this.gradesCache.clear();
    this.attendanceCache.clear();
  }

  /**
   * Proxies headers from ApiService to secure the request with institution contexts and OAuth.
   */
  private getHeaders(): Record<string, string> {
    return this.apiService.headers;
  }
}
