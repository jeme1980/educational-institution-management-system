-- CreateTable
CREATE TABLE "app_state" (
    "id" UUID NOT NULL,
    "institutionId" UUID NOT NULL,
    "data" JSONB NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "app_state_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "regions" (
    "id" UUID NOT NULL,
    "nameAr" TEXT NOT NULL,
    "nameHe" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "regions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "towns" (
    "id" UUID NOT NULL,
    "nameAr" TEXT NOT NULL,
    "nameHe" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "towns_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "institution_statuses" (
    "id" UUID NOT NULL,
    "schoolCode" VARCHAR(50),
    "nameAr" TEXT NOT NULL,
    "nameHe" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "isSystem" BOOLEAN NOT NULL DEFAULT false,
    "allowsLogin" BOOLEAN NOT NULL DEFAULT true,
    "allowsWrites" BOOLEAN NOT NULL DEFAULT true,
    "isBillable" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "institution_statuses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "languages" (
    "id" UUID NOT NULL,
    "nameAr" TEXT NOT NULL,
    "nameHe" TEXT,
    "nativeName" TEXT NOT NULL,
    "direction" VARCHAR(3) NOT NULL DEFAULT 'rtl',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "isSystem" BOOLEAN NOT NULL DEFAULT false,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "languages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "education_types" (
    "id" UUID NOT NULL,
    "nameAr" TEXT NOT NULL,
    "nameHe" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "isSystem" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "education_types_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "education_stages" (
    "id" UUID NOT NULL,
    "nameAr" TEXT NOT NULL,
    "nameHe" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "isSystem" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "education_stages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "grade_levels" (
    "id" UUID NOT NULL,
    "codeNumber" INTEGER NOT NULL,
    "nameAr" VARCHAR(50) NOT NULL,
    "nameHe" VARCHAR(10),
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "grade_levels_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "class_types" (
    "id" UUID NOT NULL,
    "nameAr" TEXT NOT NULL,
    "nameHe" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "isSystem" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "class_types_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "composition_types" (
    "id" UUID NOT NULL,
    "nameAr" TEXT NOT NULL,
    "nameHe" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "isSystem" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "composition_types_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "institutions" (
    "id" UUID NOT NULL,
    "schoolCode" VARCHAR(20) NOT NULL,
    "slug" VARCHAR(80) NOT NULL,
    "nameAr" TEXT NOT NULL,
    "nameHe" TEXT,
    "phoneNumber" VARCHAR(50),
    "email" VARCHAR(250),
    "typeId" UUID NOT NULL,
    "regionId" UUID NOT NULL,
    "townId" UUID,
    "statusId" UUID NOT NULL,
    "defaultLanguageId" UUID NOT NULL,
    "logoUrl" TEXT,
    "brandingSettings" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "archivedAt" TIMESTAMP(3),
    "createdBy" UUID,
    "updatedBy" UUID,

    CONSTRAINT "institutions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "academic_years" (
    "id" UUID NOT NULL,
    "institutionId" UUID NOT NULL,
    "yearLabel" TEXT NOT NULL,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3) NOT NULL,
    "isCurrent" BOOLEAN NOT NULL DEFAULT false,
    "isClosed" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "archivedAt" TIMESTAMP(3),
    "createdBy" UUID,
    "updatedBy" UUID,

    CONSTRAINT "academic_years_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "institution_profiles" (
    "id" UUID NOT NULL,
    "institutionId" UUID NOT NULL,
    "academicYearId" UUID NOT NULL,
    "principalStaffMemberId" UUID,
    "careLevel" DECIMAL(4,2),
    "schoolVisionAr" TEXT,
    "schoolVisionHe" TEXT,
    "inspectorNameAr" VARCHAR(50),
    "inspectorNameHe" VARCHAR(50),
    "localAuthorityAr" VARCHAR(50),
    "localAuthorityHe" VARCHAR(50),
    "educationDepartmentHeadAr" VARCHAR(50),
    "educationDepartmentHeadHe" VARCHAR(50),
    "escortLevel" INTEGER,
    "totalStudentsCache" INTEGER DEFAULT 0,
    "totalClassesCache" INTEGER DEFAULT 0,
    "totalTeachersCache" INTEGER DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "institution_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "academic_periods" (
    "id" UUID NOT NULL,
    "institutionId" UUID NOT NULL,
    "academicYearId" UUID NOT NULL,
    "nameAr" TEXT NOT NULL,
    "nameHe" TEXT,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3) NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "archivedAt" TIMESTAMP(3),
    "createdBy" UUID,
    "updatedBy" UUID,

    CONSTRAINT "academic_periods_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "genders" (
    "id" UUID NOT NULL,
    "nameAr" TEXT NOT NULL,
    "nameHe" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "versionNumber" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "genders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "student_statuses" (
    "id" UUID NOT NULL,
    "nameAr" TEXT NOT NULL,
    "nameHe" TEXT,
    "isFinalStatus" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "versionNumber" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "student_statuses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "students" (
    "id" UUID NOT NULL,
    "institutionId" UUID NOT NULL,
    "genderId" UUID,
    "studentStatusId" UUID NOT NULL,
    "townId" UUID,
    "nationalId" VARCHAR(50),
    "firstNameAr" VARCHAR(150) NOT NULL,
    "lastNameAr" VARCHAR(150) NOT NULL,
    "firstNameHe" VARCHAR(150),
    "lastNameHe" VARCHAR(150),
    "birthDate" DATE,
    "photoUrl" VARCHAR(1000),
    "email" VARCHAR(250),
    "phoneNumber" VARCHAR(50),
    "addressAr" TEXT,
    "addressHe" TEXT,
    "notes" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "versionNumber" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "students_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "staff_members" (
    "id" UUID NOT NULL,
    "institutionId" UUID NOT NULL,
    "staffCode" TEXT NOT NULL,
    "nationalId" TEXT,
    "firstNameAr" TEXT NOT NULL,
    "firstNameHe" TEXT,
    "familyNameAr" TEXT NOT NULL,
    "familyNameHe" TEXT,
    "phoneNumber" VARCHAR(50),
    "email" VARCHAR(250),
    "genderId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "archivedAt" TIMESTAMP(3),
    "createdBy" UUID,
    "updatedBy" UUID,

    CONSTRAINT "staff_members_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "job_roles" (
    "id" UUID NOT NULL,
    "institutionId" UUID NOT NULL,
    "nameAr" TEXT NOT NULL,
    "nameHe" TEXT,
    "isTeachingRole" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "archivedAt" TIMESTAMP(3),
    "createdBy" UUID,
    "updatedBy" UUID,

    CONSTRAINT "job_roles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "staff_assignments" (
    "id" UUID NOT NULL,
    "institutionId" UUID NOT NULL,
    "academicYearId" UUID NOT NULL,
    "staffMemberId" UUID NOT NULL,
    "jobRoleId" UUID NOT NULL,
    "startDate" DATE NOT NULL,
    "endDate" DATE,
    "isPrimary" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "archivedAt" TIMESTAMP(3),
    "createdBy" UUID,
    "updatedBy" UUID,

    CONSTRAINT "staff_assignments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "staff_assignment_subjects" (
    "id" UUID NOT NULL,
    "institutionId" UUID NOT NULL,
    "staffAssignmentId" UUID NOT NULL,
    "subjectId" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "staff_assignment_subjects_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "email" VARCHAR(250) NOT NULL,
    "normalizedEmail" VARCHAR(250) NOT NULL,
    "passwordHash" VARCHAR(500) NOT NULL,
    "securityStamp" VARCHAR(100),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "mustChangePassword" BOOLEAN NOT NULL DEFAULT false,
    "failedLoginAttempts" INTEGER NOT NULL DEFAULT 0,
    "lockedUntil" TIMESTAMP(3),
    "lastLoginAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "versionNumber" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "institution_users" (
    "id" UUID NOT NULL,
    "institutionId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "staffMemberId" UUID NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "archivedAt" TIMESTAMP(3),
    "createdBy" UUID,
    "updatedBy" UUID,

    CONSTRAINT "institution_users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "roles" (
    "id" UUID NOT NULL,
    "institutionId" UUID NOT NULL,
    "nameAr" TEXT NOT NULL,
    "nameHe" TEXT,
    "isSystem" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "archivedAt" TIMESTAMP(3),
    "createdBy" UUID,
    "updatedBy" UUID,

    CONSTRAINT "roles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "permissions" (
    "id" UUID NOT NULL,
    "module" VARCHAR(50) NOT NULL,
    "action" VARCHAR(50) NOT NULL,
    "nameAr" TEXT NOT NULL,
    "nameHe" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "permissions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "role_permissions" (
    "id" UUID NOT NULL,
    "institutionId" UUID NOT NULL,
    "roleId" UUID NOT NULL,
    "permissionId" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" UUID,

    CONSTRAINT "role_permissions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "institution_user_roles" (
    "id" UUID NOT NULL,
    "institutionId" UUID NOT NULL,
    "institutionUserId" UUID NOT NULL,
    "roleId" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" UUID,

    CONSTRAINT "institution_user_roles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "classes" (
    "id" UUID NOT NULL,
    "institutionId" UUID NOT NULL,
    "academicYearId" UUID NOT NULL,
    "stageId" UUID NOT NULL,
    "gradeLevelId" UUID NOT NULL,
    "parallelNumber" INTEGER NOT NULL DEFAULT 1,
    "nameAr" TEXT NOT NULL,
    "nameHe" TEXT,
    "typeId" UUID NOT NULL,
    "compositionId" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "archivedAt" TIMESTAMP(3),
    "createdBy" UUID,
    "updatedBy" UUID,

    CONSTRAINT "classes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "enrollment_statuses" (
    "id" UUID NOT NULL,
    "nameAr" TEXT NOT NULL,
    "nameHe" TEXT,
    "isFinalStatus" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "versionNumber" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "enrollment_statuses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "student_enrollments" (
    "id" UUID NOT NULL,
    "institutionId" UUID NOT NULL,
    "academicYearId" UUID NOT NULL,
    "studentId" UUID NOT NULL,
    "classId" UUID NOT NULL,
    "enrollmentStatusId" UUID NOT NULL,
    "studentFeatureId" UUID,
    "enrollmentNumber" VARCHAR(50),
    "startDate" DATE NOT NULL,
    "endDate" DATE,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "versionNumber" INTEGER NOT NULL DEFAULT 1,
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "deletedAt" TIMESTAMP(3),
    "deletedByUserId" UUID,

    CONSTRAINT "student_enrollments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "student_features" (
    "id" UUID NOT NULL,
    "nameAr" TEXT NOT NULL,
    "nameHe" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "student_features_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "relation_types" (
    "id" UUID NOT NULL,
    "nameAr" TEXT NOT NULL,
    "nameHe" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "versionNumber" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "relation_types_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "guardians" (
    "id" UUID NOT NULL,
    "institutionId" UUID NOT NULL,
    "nationalId" VARCHAR(50),
    "firstNameAr" VARCHAR(150) NOT NULL,
    "lastNameAr" VARCHAR(150) NOT NULL,
    "firstNameHe" VARCHAR(150),
    "lastNameHe" VARCHAR(150),
    "primaryPhoneNumber" VARCHAR(50) NOT NULL,
    "secondaryPhoneNumber" VARCHAR(50),
    "email" VARCHAR(250),
    "addressAr" TEXT,
    "addressHe" TEXT,
    "jobTitleAr" VARCHAR(150),
    "jobTitleHe" VARCHAR(150),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "versionNumber" INTEGER NOT NULL DEFAULT 1,
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "deletedAt" TIMESTAMP(3),
    "deletedByUserId" UUID,

    CONSTRAINT "guardians_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "student_guardians" (
    "id" UUID NOT NULL,
    "institutionId" UUID NOT NULL,
    "studentId" UUID NOT NULL,
    "guardianId" UUID NOT NULL,
    "relationTypeId" UUID NOT NULL,
    "isPrimaryContact" BOOLEAN NOT NULL DEFAULT false,
    "isFinancialResponsible" BOOLEAN NOT NULL DEFAULT false,
    "hasCustody" BOOLEAN NOT NULL DEFAULT false,
    "canPickup" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "versionNumber" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "student_guardians_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "student_medical_profiles" (
    "id" UUID NOT NULL,
    "institutionId" UUID NOT NULL,
    "studentId" UUID NOT NULL,
    "bloodType" VARCHAR(10),
    "allergiesDescription" TEXT,
    "chronicConditions" TEXT,
    "emergencyInstructions" TEXT,
    "hasSpecialNeeds" BOOLEAN NOT NULL DEFAULT false,
    "specialNeedsNotes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "versionNumber" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "student_medical_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "subjects" (
    "id" UUID NOT NULL,
    "institutionId" UUID NOT NULL,
    "academicYearId" UUID NOT NULL,
    "nameAr" TEXT NOT NULL,
    "nameHe" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "archivedAt" TIMESTAMP(3),
    "createdBy" UUID,
    "updatedBy" UUID,

    CONSTRAINT "subjects_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "topics" (
    "id" UUID NOT NULL,
    "institutionId" UUID NOT NULL,
    "academicYearId" UUID NOT NULL,
    "subjectId" UUID NOT NULL,
    "gradeLevelId" UUID NOT NULL,
    "nameAr" TEXT NOT NULL,
    "nameHe" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "archivedAt" TIMESTAMP(3),
    "createdBy" UUID,
    "updatedBy" UUID,

    CONSTRAINT "topics_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "skills" (
    "id" UUID NOT NULL,
    "institutionId" UUID NOT NULL,
    "academicYearId" UUID NOT NULL,
    "subjectId" UUID NOT NULL,
    "gradeLevelId" UUID NOT NULL,
    "nameAr" TEXT NOT NULL,
    "nameHe" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "archivedAt" TIMESTAMP(3),
    "createdBy" UUID,
    "updatedBy" UUID,

    CONSTRAINT "skills_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "question_types" (
    "id" UUID NOT NULL,
    "institutionId" UUID NOT NULL,
    "nameAr" TEXT NOT NULL,
    "nameHe" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "question_types_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "exam_types" (
    "id" UUID NOT NULL,
    "institutionId" UUID NOT NULL,
    "nameAr" TEXT NOT NULL,
    "nameHe" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "exam_types_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "study_groups" (
    "id" UUID NOT NULL,
    "institutionId" UUID NOT NULL,
    "academicYearId" UUID NOT NULL,
    "classId" UUID,
    "subjectId" UUID NOT NULL,
    "staffAssignmentId" UUID,
    "nameAr" TEXT NOT NULL,
    "nameHe" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "archivedAt" TIMESTAMP(3),
    "createdBy" UUID,
    "updatedBy" UUID,

    CONSTRAINT "study_groups_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "study_group_students" (
    "id" UUID NOT NULL,
    "institutionId" UUID NOT NULL,
    "studyGroupId" UUID NOT NULL,
    "studentEnrollmentId" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "study_group_students_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "exams" (
    "id" UUID NOT NULL,
    "institutionId" UUID NOT NULL,
    "academicYearId" UUID NOT NULL,
    "academicPeriodId" UUID NOT NULL,
    "subjectId" UUID NOT NULL,
    "examTypeId" UUID NOT NULL,
    "titleAr" TEXT NOT NULL,
    "titleHe" TEXT,
    "examDate" DATE NOT NULL,
    "maxScore" DECIMAL(5,2) NOT NULL,
    "weight" DECIMAL(5,2),
    "isPublished" BOOLEAN NOT NULL DEFAULT false,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "archivedAt" TIMESTAMP(3),
    "createdBy" UUID,
    "updatedBy" UUID,

    CONSTRAINT "exams_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "exam_study_groups" (
    "id" UUID NOT NULL,
    "institutionId" UUID NOT NULL,
    "examId" UUID NOT NULL,
    "studyGroupId" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "exam_study_groups_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "exam_questions" (
    "id" UUID NOT NULL,
    "institutionId" UUID NOT NULL,
    "examId" UUID NOT NULL,
    "questionTypeId" UUID NOT NULL,
    "topicId" UUID,
    "skillId" UUID,
    "questionNumber" INTEGER NOT NULL,
    "maxScore" DECIMAL(5,2) NOT NULL,
    "contentAr" TEXT,
    "contentHe" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "exam_questions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "student_question_scores" (
    "id" UUID NOT NULL,
    "institutionId" UUID NOT NULL,
    "examQuestionId" UUID NOT NULL,
    "studentId" UUID NOT NULL,
    "score" DECIMAL(5,2) NOT NULL,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "student_question_scores_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "student_exam_results" (
    "id" UUID NOT NULL,
    "institutionId" UUID NOT NULL,
    "examId" UUID NOT NULL,
    "studentId" UUID NOT NULL,
    "totalScore" DECIMAL(5,2) NOT NULL,
    "isAbsence" BOOLEAN NOT NULL DEFAULT false,
    "absenceReason" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "student_exam_results_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "app_state_institutionId_key" ON "app_state"("institutionId");

-- CreateIndex
CREATE INDEX "regions_isActive_sortOrder_idx" ON "regions"("isActive", "sortOrder");

-- CreateIndex
CREATE UNIQUE INDEX "regions_nameAr_key" ON "regions"("nameAr");

-- CreateIndex
CREATE UNIQUE INDEX "towns_nameAr_key" ON "towns"("nameAr");

-- CreateIndex
CREATE UNIQUE INDEX "institution_statuses_schoolCode_key" ON "institution_statuses"("schoolCode");

-- CreateIndex
CREATE INDEX "institution_statuses_isActive_sortOrder_idx" ON "institution_statuses"("isActive", "sortOrder");

-- CreateIndex
CREATE INDEX "languages_isActive_sortOrder_idx" ON "languages"("isActive", "sortOrder");

-- CreateIndex
CREATE INDEX "education_types_isActive_sortOrder_idx" ON "education_types"("isActive", "sortOrder");

-- CreateIndex
CREATE INDEX "education_stages_isActive_sortOrder_idx" ON "education_stages"("isActive", "sortOrder");

-- CreateIndex
CREATE UNIQUE INDEX "grade_levels_codeNumber_key" ON "grade_levels"("codeNumber");

-- CreateIndex
CREATE INDEX "grade_levels_isActive_sortOrder_idx" ON "grade_levels"("isActive", "sortOrder");

-- CreateIndex
CREATE INDEX "class_types_isActive_sortOrder_idx" ON "class_types"("isActive", "sortOrder");

-- CreateIndex
CREATE INDEX "composition_types_isActive_sortOrder_idx" ON "composition_types"("isActive", "sortOrder");

-- CreateIndex
CREATE UNIQUE INDEX "institutions_schoolCode_key" ON "institutions"("schoolCode");

-- CreateIndex
CREATE UNIQUE INDEX "institutions_slug_key" ON "institutions"("slug");

-- CreateIndex
CREATE INDEX "institutions_statusId_idx" ON "institutions"("statusId");

-- CreateIndex
CREATE INDEX "institutions_regionId_idx" ON "institutions"("regionId");

-- CreateIndex
CREATE INDEX "institutions_townId_idx" ON "institutions"("townId");

-- CreateIndex
CREATE INDEX "academic_years_institutionId_isCurrent_idx" ON "academic_years"("institutionId", "isCurrent");

-- CreateIndex
CREATE UNIQUE INDEX "academic_years_institutionId_yearLabel_key" ON "academic_years"("institutionId", "yearLabel");

-- CreateIndex
CREATE INDEX "institution_profiles_institutionId_idx" ON "institution_profiles"("institutionId");

-- CreateIndex
CREATE INDEX "institution_profiles_academicYearId_idx" ON "institution_profiles"("academicYearId");

-- CreateIndex
CREATE UNIQUE INDEX "institution_profiles_institutionId_academicYearId_key" ON "institution_profiles"("institutionId", "academicYearId");

-- CreateIndex
CREATE INDEX "academic_periods_institutionId_academicYearId_isActive_idx" ON "academic_periods"("institutionId", "academicYearId", "isActive");

-- CreateIndex
CREATE INDEX "genders_isActive_sortOrder_idx" ON "genders"("isActive", "sortOrder");

-- CreateIndex
CREATE INDEX "student_statuses_isActive_sortOrder_idx" ON "student_statuses"("isActive", "sortOrder");

-- CreateIndex
CREATE INDEX "students_genderId_idx" ON "students"("genderId");

-- CreateIndex
CREATE INDEX "students_studentStatusId_idx" ON "students"("studentStatusId");

-- CreateIndex
CREATE INDEX "students_townId_idx" ON "students"("townId");

-- CreateIndex
CREATE UNIQUE INDEX "students_institutionId_nationalId_key" ON "students"("institutionId", "nationalId");

-- CreateIndex
CREATE INDEX "staff_members_genderId_idx" ON "staff_members"("genderId");

-- CreateIndex
CREATE UNIQUE INDEX "staff_members_institutionId_staffCode_key" ON "staff_members"("institutionId", "staffCode");

-- CreateIndex
CREATE UNIQUE INDEX "staff_members_institutionId_nationalId_key" ON "staff_members"("institutionId", "nationalId");

-- CreateIndex
CREATE INDEX "job_roles_institutionId_isActive_sortOrder_idx" ON "job_roles"("institutionId", "isActive", "sortOrder");

-- CreateIndex
CREATE INDEX "staff_assignments_institutionId_academicYearId_staffMemberI_idx" ON "staff_assignments"("institutionId", "academicYearId", "staffMemberId", "isActive");

-- CreateIndex
CREATE INDEX "staff_assignments_institutionId_jobRoleId_idx" ON "staff_assignments"("institutionId", "jobRoleId");

-- CreateIndex
CREATE UNIQUE INDEX "staff_assignments_institutionId_academicYearId_staffMemberI_key" ON "staff_assignments"("institutionId", "academicYearId", "staffMemberId");

-- CreateIndex
CREATE INDEX "staff_assignment_subjects_institutionId_staffAssignmentId_idx" ON "staff_assignment_subjects"("institutionId", "staffAssignmentId");

-- CreateIndex
CREATE INDEX "staff_assignment_subjects_institutionId_subjectId_idx" ON "staff_assignment_subjects"("institutionId", "subjectId");

-- CreateIndex
CREATE UNIQUE INDEX "staff_assignment_subjects_staffAssignmentId_subjectId_key" ON "staff_assignment_subjects"("staffAssignmentId", "subjectId");

-- CreateIndex
CREATE UNIQUE INDEX "users_normalizedEmail_key" ON "users"("normalizedEmail");

-- CreateIndex
CREATE INDEX "users_email_idx" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "institution_users_userId_key" ON "institution_users"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "institution_users_staffMemberId_key" ON "institution_users"("staffMemberId");

-- CreateIndex
CREATE INDEX "institution_users_institutionId_isActive_idx" ON "institution_users"("institutionId", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "institution_users_institutionId_staffMemberId_key" ON "institution_users"("institutionId", "staffMemberId");

-- CreateIndex
CREATE INDEX "roles_institutionId_isActive_idx" ON "roles"("institutionId", "isActive");

-- CreateIndex
CREATE INDEX "permissions_isActive_module_idx" ON "permissions"("isActive", "module");

-- CreateIndex
CREATE UNIQUE INDEX "permissions_module_action_key" ON "permissions"("module", "action");

-- CreateIndex
CREATE INDEX "role_permissions_permissionId_idx" ON "role_permissions"("permissionId");

-- CreateIndex
CREATE UNIQUE INDEX "role_permissions_institutionId_roleId_permissionId_key" ON "role_permissions"("institutionId", "roleId", "permissionId");

-- CreateIndex
CREATE INDEX "institution_user_roles_institutionId_roleId_idx" ON "institution_user_roles"("institutionId", "roleId");

-- CreateIndex
CREATE UNIQUE INDEX "institution_user_roles_institutionId_institutionUserId_role_key" ON "institution_user_roles"("institutionId", "institutionUserId", "roleId");

-- CreateIndex
CREATE INDEX "classes_stageId_idx" ON "classes"("stageId");

-- CreateIndex
CREATE INDEX "classes_gradeLevelId_idx" ON "classes"("gradeLevelId");

-- CreateIndex
CREATE INDEX "classes_typeId_idx" ON "classes"("typeId");

-- CreateIndex
CREATE INDEX "classes_compositionId_idx" ON "classes"("compositionId");

-- CreateIndex
CREATE UNIQUE INDEX "classes_institutionId_academicYearId_stageId_gradeLevelId_p_key" ON "classes"("institutionId", "academicYearId", "stageId", "gradeLevelId", "parallelNumber");

-- CreateIndex
CREATE INDEX "enrollment_statuses_isActive_sortOrder_idx" ON "enrollment_statuses"("isActive", "sortOrder");

-- CreateIndex
CREATE INDEX "student_enrollments_institutionId_academicYearId_studentId__idx" ON "student_enrollments"("institutionId", "academicYearId", "studentId", "isActive", "isDeleted");

-- CreateIndex
CREATE INDEX "student_enrollments_enrollmentStatusId_idx" ON "student_enrollments"("enrollmentStatusId");

-- CreateIndex
CREATE INDEX "student_enrollments_studentFeatureId_idx" ON "student_enrollments"("studentFeatureId");

-- CreateIndex
CREATE UNIQUE INDEX "student_enrollments_institutionId_academicYearId_studentId_key" ON "student_enrollments"("institutionId", "academicYearId", "studentId");

-- CreateIndex
CREATE INDEX "relation_types_isActive_sortOrder_idx" ON "relation_types"("isActive", "sortOrder");

-- CreateIndex
CREATE INDEX "guardians_institutionId_idx" ON "guardians"("institutionId");

-- CreateIndex
CREATE UNIQUE INDEX "guardians_institutionId_nationalId_key" ON "guardians"("institutionId", "nationalId");

-- CreateIndex
CREATE INDEX "student_guardians_institutionId_studentId_idx" ON "student_guardians"("institutionId", "studentId");

-- CreateIndex
CREATE INDEX "student_guardians_institutionId_guardianId_idx" ON "student_guardians"("institutionId", "guardianId");

-- CreateIndex
CREATE UNIQUE INDEX "student_guardians_institutionId_studentId_guardianId_key" ON "student_guardians"("institutionId", "studentId", "guardianId");

-- CreateIndex
CREATE UNIQUE INDEX "student_medical_profiles_studentId_key" ON "student_medical_profiles"("studentId");

-- CreateIndex
CREATE INDEX "student_medical_profiles_institutionId_idx" ON "student_medical_profiles"("institutionId");

-- CreateIndex
CREATE INDEX "topics_institutionId_academicYearId_subjectId_idx" ON "topics"("institutionId", "academicYearId", "subjectId");

-- CreateIndex
CREATE INDEX "topics_gradeLevelId_idx" ON "topics"("gradeLevelId");

-- CreateIndex
CREATE INDEX "skills_institutionId_academicYearId_subjectId_idx" ON "skills"("institutionId", "academicYearId", "subjectId");

-- CreateIndex
CREATE INDEX "skills_gradeLevelId_idx" ON "skills"("gradeLevelId");

-- CreateIndex
CREATE INDEX "question_types_institutionId_isActive_sortOrder_idx" ON "question_types"("institutionId", "isActive", "sortOrder");

-- CreateIndex
CREATE INDEX "exam_types_institutionId_isActive_sortOrder_idx" ON "exam_types"("institutionId", "isActive", "sortOrder");

-- CreateIndex
CREATE INDEX "study_groups_institutionId_academicYearId_subjectId_idx" ON "study_groups"("institutionId", "academicYearId", "subjectId");

-- CreateIndex
CREATE INDEX "study_groups_classId_idx" ON "study_groups"("classId");

-- CreateIndex
CREATE INDEX "study_group_students_institutionId_studyGroupId_idx" ON "study_group_students"("institutionId", "studyGroupId");

-- CreateIndex
CREATE INDEX "study_group_students_institutionId_studentEnrollmentId_idx" ON "study_group_students"("institutionId", "studentEnrollmentId");

-- CreateIndex
CREATE UNIQUE INDEX "study_group_students_studyGroupId_studentEnrollmentId_key" ON "study_group_students"("studyGroupId", "studentEnrollmentId");

-- CreateIndex
CREATE INDEX "exams_institutionId_academicYearId_academicPeriodId_idx" ON "exams"("institutionId", "academicYearId", "academicPeriodId");

-- CreateIndex
CREATE INDEX "exams_subjectId_idx" ON "exams"("subjectId");

-- CreateIndex
CREATE INDEX "exams_examTypeId_idx" ON "exams"("examTypeId");

-- CreateIndex
CREATE INDEX "exam_study_groups_institutionId_examId_idx" ON "exam_study_groups"("institutionId", "examId");

-- CreateIndex
CREATE INDEX "exam_study_groups_institutionId_studyGroupId_idx" ON "exam_study_groups"("institutionId", "studyGroupId");

-- CreateIndex
CREATE UNIQUE INDEX "exam_study_groups_examId_studyGroupId_key" ON "exam_study_groups"("examId", "studyGroupId");

-- CreateIndex
CREATE INDEX "exam_questions_institutionId_examId_idx" ON "exam_questions"("institutionId", "examId");

-- CreateIndex
CREATE INDEX "exam_questions_topicId_idx" ON "exam_questions"("topicId");

-- CreateIndex
CREATE INDEX "exam_questions_skillId_idx" ON "exam_questions"("skillId");

-- CreateIndex
CREATE UNIQUE INDEX "exam_questions_examId_questionNumber_key" ON "exam_questions"("examId", "questionNumber");

-- CreateIndex
CREATE INDEX "student_question_scores_institutionId_studentId_idx" ON "student_question_scores"("institutionId", "studentId");

-- CreateIndex
CREATE UNIQUE INDEX "student_question_scores_examQuestionId_studentId_key" ON "student_question_scores"("examQuestionId", "studentId");

-- CreateIndex
CREATE INDEX "student_exam_results_institutionId_studentId_idx" ON "student_exam_results"("institutionId", "studentId");

-- CreateIndex
CREATE UNIQUE INDEX "student_exam_results_examId_studentId_key" ON "student_exam_results"("examId", "studentId");

-- AddForeignKey
ALTER TABLE "app_state" ADD CONSTRAINT "app_state_institutionId_fkey" FOREIGN KEY ("institutionId") REFERENCES "institutions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "institutions" ADD CONSTRAINT "institutions_typeId_fkey" FOREIGN KEY ("typeId") REFERENCES "education_types"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "institutions" ADD CONSTRAINT "institutions_regionId_fkey" FOREIGN KEY ("regionId") REFERENCES "regions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "institutions" ADD CONSTRAINT "institutions_townId_fkey" FOREIGN KEY ("townId") REFERENCES "towns"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "institutions" ADD CONSTRAINT "institutions_statusId_fkey" FOREIGN KEY ("statusId") REFERENCES "institution_statuses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "institutions" ADD CONSTRAINT "institutions_defaultLanguageId_fkey" FOREIGN KEY ("defaultLanguageId") REFERENCES "languages"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "academic_years" ADD CONSTRAINT "academic_years_institutionId_fkey" FOREIGN KEY ("institutionId") REFERENCES "institutions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "institution_profiles" ADD CONSTRAINT "institution_profiles_institutionId_fkey" FOREIGN KEY ("institutionId") REFERENCES "institutions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "institution_profiles" ADD CONSTRAINT "institution_profiles_academicYearId_fkey" FOREIGN KEY ("academicYearId") REFERENCES "academic_years"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "institution_profiles" ADD CONSTRAINT "institution_profiles_principalStaffMemberId_fkey" FOREIGN KEY ("principalStaffMemberId") REFERENCES "staff_members"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "academic_periods" ADD CONSTRAINT "academic_periods_institutionId_fkey" FOREIGN KEY ("institutionId") REFERENCES "institutions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "academic_periods" ADD CONSTRAINT "academic_periods_academicYearId_fkey" FOREIGN KEY ("academicYearId") REFERENCES "academic_years"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "students" ADD CONSTRAINT "students_institutionId_fkey" FOREIGN KEY ("institutionId") REFERENCES "institutions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "students" ADD CONSTRAINT "students_genderId_fkey" FOREIGN KEY ("genderId") REFERENCES "genders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "students" ADD CONSTRAINT "students_studentStatusId_fkey" FOREIGN KEY ("studentStatusId") REFERENCES "student_statuses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "students" ADD CONSTRAINT "students_townId_fkey" FOREIGN KEY ("townId") REFERENCES "towns"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "staff_members" ADD CONSTRAINT "staff_members_institutionId_fkey" FOREIGN KEY ("institutionId") REFERENCES "institutions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "staff_members" ADD CONSTRAINT "staff_members_genderId_fkey" FOREIGN KEY ("genderId") REFERENCES "genders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "job_roles" ADD CONSTRAINT "job_roles_institutionId_fkey" FOREIGN KEY ("institutionId") REFERENCES "institutions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "staff_assignments" ADD CONSTRAINT "staff_assignments_institutionId_fkey" FOREIGN KEY ("institutionId") REFERENCES "institutions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "staff_assignments" ADD CONSTRAINT "staff_assignments_academicYearId_fkey" FOREIGN KEY ("academicYearId") REFERENCES "academic_years"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "staff_assignments" ADD CONSTRAINT "staff_assignments_staffMemberId_fkey" FOREIGN KEY ("staffMemberId") REFERENCES "staff_members"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "staff_assignments" ADD CONSTRAINT "staff_assignments_jobRoleId_fkey" FOREIGN KEY ("jobRoleId") REFERENCES "job_roles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "staff_assignment_subjects" ADD CONSTRAINT "staff_assignment_subjects_institutionId_fkey" FOREIGN KEY ("institutionId") REFERENCES "institutions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "staff_assignment_subjects" ADD CONSTRAINT "staff_assignment_subjects_staffAssignmentId_fkey" FOREIGN KEY ("staffAssignmentId") REFERENCES "staff_assignments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "staff_assignment_subjects" ADD CONSTRAINT "staff_assignment_subjects_subjectId_fkey" FOREIGN KEY ("subjectId") REFERENCES "subjects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "institution_users" ADD CONSTRAINT "institution_users_institutionId_fkey" FOREIGN KEY ("institutionId") REFERENCES "institutions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "institution_users" ADD CONSTRAINT "institution_users_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "institution_users" ADD CONSTRAINT "institution_users_staffMemberId_fkey" FOREIGN KEY ("staffMemberId") REFERENCES "staff_members"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "roles" ADD CONSTRAINT "roles_institutionId_fkey" FOREIGN KEY ("institutionId") REFERENCES "institutions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_institutionId_fkey" FOREIGN KEY ("institutionId") REFERENCES "institutions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "roles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_permissionId_fkey" FOREIGN KEY ("permissionId") REFERENCES "permissions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "institution_user_roles" ADD CONSTRAINT "institution_user_roles_institutionId_fkey" FOREIGN KEY ("institutionId") REFERENCES "institutions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "institution_user_roles" ADD CONSTRAINT "institution_user_roles_institutionUserId_fkey" FOREIGN KEY ("institutionUserId") REFERENCES "institution_users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "institution_user_roles" ADD CONSTRAINT "institution_user_roles_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "roles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "classes" ADD CONSTRAINT "classes_institutionId_fkey" FOREIGN KEY ("institutionId") REFERENCES "institutions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "classes" ADD CONSTRAINT "classes_academicYearId_fkey" FOREIGN KEY ("academicYearId") REFERENCES "academic_years"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "classes" ADD CONSTRAINT "classes_stageId_fkey" FOREIGN KEY ("stageId") REFERENCES "education_stages"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "classes" ADD CONSTRAINT "classes_gradeLevelId_fkey" FOREIGN KEY ("gradeLevelId") REFERENCES "grade_levels"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "classes" ADD CONSTRAINT "classes_typeId_fkey" FOREIGN KEY ("typeId") REFERENCES "class_types"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "classes" ADD CONSTRAINT "classes_compositionId_fkey" FOREIGN KEY ("compositionId") REFERENCES "composition_types"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_enrollments" ADD CONSTRAINT "student_enrollments_institutionId_fkey" FOREIGN KEY ("institutionId") REFERENCES "institutions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_enrollments" ADD CONSTRAINT "student_enrollments_academicYearId_fkey" FOREIGN KEY ("academicYearId") REFERENCES "academic_years"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_enrollments" ADD CONSTRAINT "student_enrollments_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "students"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_enrollments" ADD CONSTRAINT "student_enrollments_classId_fkey" FOREIGN KEY ("classId") REFERENCES "classes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_enrollments" ADD CONSTRAINT "student_enrollments_enrollmentStatusId_fkey" FOREIGN KEY ("enrollmentStatusId") REFERENCES "enrollment_statuses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_enrollments" ADD CONSTRAINT "student_enrollments_studentFeatureId_fkey" FOREIGN KEY ("studentFeatureId") REFERENCES "student_features"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "guardians" ADD CONSTRAINT "guardians_institutionId_fkey" FOREIGN KEY ("institutionId") REFERENCES "institutions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_guardians" ADD CONSTRAINT "student_guardians_institutionId_fkey" FOREIGN KEY ("institutionId") REFERENCES "institutions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_guardians" ADD CONSTRAINT "student_guardians_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "students"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_guardians" ADD CONSTRAINT "student_guardians_guardianId_fkey" FOREIGN KEY ("guardianId") REFERENCES "guardians"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_guardians" ADD CONSTRAINT "student_guardians_relationTypeId_fkey" FOREIGN KEY ("relationTypeId") REFERENCES "relation_types"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_medical_profiles" ADD CONSTRAINT "student_medical_profiles_institutionId_fkey" FOREIGN KEY ("institutionId") REFERENCES "institutions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_medical_profiles" ADD CONSTRAINT "student_medical_profiles_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "students"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subjects" ADD CONSTRAINT "subjects_institutionId_fkey" FOREIGN KEY ("institutionId") REFERENCES "institutions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subjects" ADD CONSTRAINT "subjects_academicYearId_fkey" FOREIGN KEY ("academicYearId") REFERENCES "academic_years"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "topics" ADD CONSTRAINT "topics_institutionId_fkey" FOREIGN KEY ("institutionId") REFERENCES "institutions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "topics" ADD CONSTRAINT "topics_academicYearId_fkey" FOREIGN KEY ("academicYearId") REFERENCES "academic_years"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "topics" ADD CONSTRAINT "topics_subjectId_fkey" FOREIGN KEY ("subjectId") REFERENCES "subjects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "topics" ADD CONSTRAINT "topics_gradeLevelId_fkey" FOREIGN KEY ("gradeLevelId") REFERENCES "grade_levels"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "skills" ADD CONSTRAINT "skills_institutionId_fkey" FOREIGN KEY ("institutionId") REFERENCES "institutions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "skills" ADD CONSTRAINT "skills_academicYearId_fkey" FOREIGN KEY ("academicYearId") REFERENCES "academic_years"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "skills" ADD CONSTRAINT "skills_subjectId_fkey" FOREIGN KEY ("subjectId") REFERENCES "subjects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "skills" ADD CONSTRAINT "skills_gradeLevelId_fkey" FOREIGN KEY ("gradeLevelId") REFERENCES "grade_levels"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "question_types" ADD CONSTRAINT "question_types_institutionId_fkey" FOREIGN KEY ("institutionId") REFERENCES "institutions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exam_types" ADD CONSTRAINT "exam_types_institutionId_fkey" FOREIGN KEY ("institutionId") REFERENCES "institutions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "study_groups" ADD CONSTRAINT "study_groups_institutionId_fkey" FOREIGN KEY ("institutionId") REFERENCES "institutions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "study_groups" ADD CONSTRAINT "study_groups_academicYearId_fkey" FOREIGN KEY ("academicYearId") REFERENCES "academic_years"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "study_groups" ADD CONSTRAINT "study_groups_classId_fkey" FOREIGN KEY ("classId") REFERENCES "classes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "study_groups" ADD CONSTRAINT "study_groups_subjectId_fkey" FOREIGN KEY ("subjectId") REFERENCES "subjects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "study_groups" ADD CONSTRAINT "study_groups_staffAssignmentId_fkey" FOREIGN KEY ("staffAssignmentId") REFERENCES "staff_assignments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "study_group_students" ADD CONSTRAINT "study_group_students_institutionId_fkey" FOREIGN KEY ("institutionId") REFERENCES "institutions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "study_group_students" ADD CONSTRAINT "study_group_students_studyGroupId_fkey" FOREIGN KEY ("studyGroupId") REFERENCES "study_groups"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "study_group_students" ADD CONSTRAINT "study_group_students_studentEnrollmentId_fkey" FOREIGN KEY ("studentEnrollmentId") REFERENCES "student_enrollments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exams" ADD CONSTRAINT "exams_institutionId_fkey" FOREIGN KEY ("institutionId") REFERENCES "institutions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exams" ADD CONSTRAINT "exams_academicYearId_fkey" FOREIGN KEY ("academicYearId") REFERENCES "academic_years"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exams" ADD CONSTRAINT "exams_academicPeriodId_fkey" FOREIGN KEY ("academicPeriodId") REFERENCES "academic_periods"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exams" ADD CONSTRAINT "exams_subjectId_fkey" FOREIGN KEY ("subjectId") REFERENCES "subjects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exams" ADD CONSTRAINT "exams_examTypeId_fkey" FOREIGN KEY ("examTypeId") REFERENCES "exam_types"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exam_study_groups" ADD CONSTRAINT "exam_study_groups_institutionId_fkey" FOREIGN KEY ("institutionId") REFERENCES "institutions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exam_study_groups" ADD CONSTRAINT "exam_study_groups_examId_fkey" FOREIGN KEY ("examId") REFERENCES "exams"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exam_study_groups" ADD CONSTRAINT "exam_study_groups_studyGroupId_fkey" FOREIGN KEY ("studyGroupId") REFERENCES "study_groups"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exam_questions" ADD CONSTRAINT "exam_questions_institutionId_fkey" FOREIGN KEY ("institutionId") REFERENCES "institutions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exam_questions" ADD CONSTRAINT "exam_questions_examId_fkey" FOREIGN KEY ("examId") REFERENCES "exams"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exam_questions" ADD CONSTRAINT "exam_questions_questionTypeId_fkey" FOREIGN KEY ("questionTypeId") REFERENCES "question_types"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exam_questions" ADD CONSTRAINT "exam_questions_topicId_fkey" FOREIGN KEY ("topicId") REFERENCES "topics"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exam_questions" ADD CONSTRAINT "exam_questions_skillId_fkey" FOREIGN KEY ("skillId") REFERENCES "skills"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_question_scores" ADD CONSTRAINT "student_question_scores_institutionId_fkey" FOREIGN KEY ("institutionId") REFERENCES "institutions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_question_scores" ADD CONSTRAINT "student_question_scores_examQuestionId_fkey" FOREIGN KEY ("examQuestionId") REFERENCES "exam_questions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_exam_results" ADD CONSTRAINT "student_exam_results_institutionId_fkey" FOREIGN KEY ("institutionId") REFERENCES "institutions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_exam_results" ADD CONSTRAINT "student_exam_results_examId_fkey" FOREIGN KEY ("examId") REFERENCES "exams"("id") ON DELETE CASCADE ON UPDATE CASCADE;
