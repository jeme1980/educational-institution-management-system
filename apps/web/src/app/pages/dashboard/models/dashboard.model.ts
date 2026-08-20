export interface DashboardStats {
  totalStudents: number;
  totalStaff: number;
  totalClasses: number;
  totalSubjects: number;
  totalExams: number;
  newRegistrations: number;
  activeGuardians: number;
  recentExams: any[];
  studentStatusBreakdown: {
    id: string;
    name: string;
    code: string;
    count: number;
  }[];
  genderBreakdown: {
    id: string;
    name: string;
    code: string;
    count: number;
  }[];
  recentEnrollments: {
    id: string;
    createdAt: string;
    studentName: string;
    className: string;
    statusName: string;
    statusCode: string;
  }[];
}
