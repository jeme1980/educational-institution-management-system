import { Injectable, inject } from '@angular/core';
import { ApiService } from '../../../core/services/api.service';
import { AnalysisQuestion, AnalysisStudent, ExamAnalysisDataset } from '../models/exam-analysis.model';

@Injectable({ providedIn: 'root' })
export class ExamAnalysisDataService {
  private api = inject(ApiService);

  async initializeLookups() {
    await Promise.all([
      this.api.loadExams(), this.api.loadSubjects(), this.api.loadClasses(),
      this.api.loadTopics(), this.api.loadSkills(), this.api.loadQuestionTypes(),
    ]);
  }

  async load(examId: string): Promise<ExamAnalysisDataset> {
    const exam = this.api.exams().find(item => item.id === examId) || await this.api.examsApi.loadExam(examId);
    if (!exam) throw new Error('EXAM_NOT_FOUND');
    const [rawQuestions, groups, backendAnalysis] = await Promise.all([
      this.api.loadExamQuestions(examId),
      this.api.loadExamStudyGroups(examId),
      this.api.loadExamAnalysis(examId),
    ]);
    const topics = this.api.topics();
    // Exam study-group links contain the actual group under `studyGroup`.
    // Flatten the display fields so the filter does not fall back to "الشعبة".
    groups.forEach((item: any) => {
      const group = item.studyGroup || item;
      item.studyGroupId = item.studyGroupId || group.id;
      item.studyGroupName = item.studyGroupName || group.nameAr || group.classRoom?.nameAr || 'الشعبة';
    });
    const skills = this.api.skills();
    const types = this.api.questionTypes();
    const questions: AnalysisQuestion[] = rawQuestions.map((question: any) => ({
      id: question.id,
      questionNumber: Number(question.questionNumber),
      points: Number(question.maxScore ?? question.points ?? 0),
      topicId: question.topicId,
      topicName: topics.find(item => item.id === question.topicId)?.nameAr || 'غير مصنف',
      skillId: question.skillId,
      skillName: skills.find(item => item.id === question.skillId)?.nameAr || 'غير مصنفة',
      typeId: question.questionTypeId,
      typeName: types.find(item => item.id === question.questionTypeId)?.nameAr || 'غير محدد',
      text: question.text || `السؤال ${question.questionNumber}`,
      correctAnswer: question.correctAnswer,
    }));

    const groupTargets = groups.length ? groups : [{ studyGroupId: 'ALL', studyGroupName: 'جميع الطلاب' }];
    // استخدم مصدر النتائج الرئيسي؛ endpoint نتائج المجموعة القديم لا يعيد نتائج حاليًا.
    const payloads = [{
      group: groupTargets[0],
      data: await this.api.loadExamResults(examId),
    }];
    const seen = new Set<string>();
    const students: AnalysisStudent[] = [];
    for (const payload of payloads) {
      for (const row of payload.data?.results || []) {
        if (seen.has(row.studentId)) continue;
        seen.add(row.studentId);
        students.push({
          studentId: row.studentId,
          studentNumber: row.studentNumber || undefined,
          studentName: row.studentName,
          groupId: payload.group.studyGroupId,
          groupIds: row.groupIds || (payload.group.studyGroupId ? [payload.group.studyGroupId] : []),
          groupName: payload.group.studyGroupName || payload.group.nameAr || 'الشعبة',
          totalScore: row.totalScore === null ? null : Number(row.totalScore),
          // نتائج الامتحان تستخدم isAbsence، بينما نموذج التحليل يستخدم isAbsent.
          isAbsent: Boolean(row.isAbsent ?? row.isAbsence),
          questionScores: (row.questionScores || []).map((score: any) => ({
            questionId: score.questionId,
            achievedScore: score.achievedScore === null || score.achievedScore === undefined ? (score.score === null || score.score === undefined ? null : Number(score.score)) : Number(score.achievedScore),
          })),
        });
      }
    }
    return { exam, students, questions, groups: groupTargets, backendAnalysis };
  }
}
