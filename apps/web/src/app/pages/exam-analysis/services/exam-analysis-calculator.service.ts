import { Injectable } from '@angular/core';
import {
  AnalysisQuestion, AnalysisStudent, AnalysisSummary, DimensionAnalysis,
  PerformanceLevel, QuestionAnalysis, StudentAnalysis,
} from '../models/exam-analysis.model';

@Injectable({ providedIn: 'root' })
export class ExamAnalysisCalculatorService {
  classify(score: number, levels: PerformanceLevel[]): PerformanceLevel {
    return levels.find(level => score >= level.min && score <= level.max) ?? levels[levels.length - 1];
  }

  validateLevels(levels: PerformanceLevel[]): string | null {
    if (!levels.length) return 'يجب إضافة مستوى أداء واحد على الأقل.';
    const sorted = [...levels].sort((a, b) => a.min - b.min);
    for (const level of sorted) {
      if (!level.name.trim()) return 'اسم مستوى الأداء مطلوب.';
      if (level.min < 0 || level.max > 100) return 'يجب أن تكون الحدود بين 0 و100.';
      if (level.min > level.max) return 'الحد الأدنى لا يمكن أن يتجاوز الحد الأعلى.';
    }
    if (sorted[0].min !== 0 || sorted[sorted.length - 1].max !== 100) return 'يجب أن تغطي المستويات النطاق الكامل من 0 إلى 100.';
    for (let index = 1; index < sorted.length; index++) {
      const gap = Number((sorted[index].min - sorted[index - 1].max).toFixed(2));
      if (gap > 0.01) return 'توجد فجوة بين نطاقات العلامات.';
      if (gap <= 0) return 'يوجد تداخل بين نطاقات العلامات.';
    }
    return null;
  }

  students(students: AnalysisStudent[], questions: AnalysisQuestion[], maxScore: number, levels: PerformanceLevel[]): StudentAnalysis[] {
    return students.map(student => {
      const normalizedScore = student.isAbsent || student.totalScore === null || !maxScore
        ? 0
        : Math.max(0, Math.min(100, (Number(student.totalScore) / maxScore) * 100));
      let correct = 0, wrong = 0, unanswered = 0;
      for (const question of questions) {
        const answer = student.questionScores.find(score => score.questionId === question.id);
        if (!answer || answer.achievedScore === null || answer.achievedScore === undefined) unanswered++;
        else if (Number(answer.achievedScore) >= question.points * 0.5) correct++;
        else wrong++;
      }
      return { ...student, normalizedScore, level: this.classify(normalizedScore, levels), correct, wrong, unanswered };
    });
  }

  summary(students: StudentAnalysis[]): AnalysisSummary {
    const attended = students.filter(student => !student.isAbsent && student.totalScore !== null);
    const absent = students.filter(student => student.isAbsent).length;
    const scores = attended.map(student => student.normalizedScore).sort((a, b) => a - b);
    const averageOf = (values: number[]) => values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
    const average = averageOf(scores);
    const standardDeviation = scores.length ? Math.sqrt(averageOf(scores.map(value => Math.pow(value - average, 2)))) : 0;
    const middle = Math.floor(scores.length / 2);
    const median = scores.length ? (scores.length % 2 ? scores[middle] : (scores[middle - 1] + scores[middle]) / 2) : 0;
    return {
      registered: students.length,
      attended: attended.length,
      absent,
      average,
      highest: scores.length ? Math.max(...scores) : 0,
      lowest: scores.length ? Math.min(...scores) : 0,
      median,
      standardDeviation,
      passRate: attended.length ? attended.filter(student => student.normalizedScore >= 50).length / attended.length * 100 : 0,
      averageCorrect: averageOf(attended.map(student => student.correct)),
      averageWrong: averageOf(attended.map(student => student.wrong)),
      averageUnanswered: averageOf(attended.map(student => student.unanswered)),
    };
  }

  questions(questions: AnalysisQuestion[], students: AnalysisStudent[], levels: PerformanceLevel[], easyAt = 80, mediumAt = 50): QuestionAnalysis[] {
    const attended = students.filter(student => !student.isAbsent && student.totalScore !== null);
    return questions.map(question => {
      const values = attended.map(student => student.questionScores.find(score => score.questionId === question.id)?.achievedScore);
      const answered = values.filter((value): value is number => value !== null && value !== undefined).map(Number);
      const correctCount = answered.filter(value => value >= question.points * 0.5).length;
      const wrongCount = answered.length - correctCount;
      const unansweredCount = attended.length - answered.length;
      // نسبة نجاح السؤال تعتمد على العلامة المحققة من العلامة القصوى، وتدعم العلامات الجزئية.
      const achievedTotal = answered.reduce((sum, value) => sum + value, 0);
      // Unanswered questions count as zero in item success; otherwise a
      // question answered only by the strongest students looks artificially easy.
      const successRate = attended.length && question.points ? achievedTotal / (attended.length * question.points) * 100 : 0;
      const performance = successRate;
      return {
        ...question,
        average: attended.length ? achievedTotal / attended.length : 0,
        successRate,
        errorRate: attended.length ? wrongCount / attended.length * 100 : 0,
        unansweredRate: attended.length ? unansweredCount / attended.length * 100 : 0,
        correctCount, wrongCount, unansweredCount,
        difficulty: successRate >= easyAt ? 'سهل' : successRate >= mediumAt ? 'متوسط' : 'صعب',
        level: this.classify(performance, levels),
      };
    });
  }

  dimensions(kind: 'skill' | 'topic' | 'type', questions: AnalysisQuestion[], students: AnalysisStudent[], levels: PerformanceLevel[]): DimensionAnalysis[] {
    const groups = new Map<string, { name: string; questions: AnalysisQuestion[] }>();
    for (const question of questions) {
      const id = kind === 'skill' ? question.skillId : kind === 'topic' ? question.topicId : question.typeId;
      const name = kind === 'skill' ? question.skillName : kind === 'topic' ? question.topicName : question.typeName;
      const group = groups.get(id) ?? { name, questions: [] };
      group.questions.push(question); groups.set(id, group);
    }
    const attended = students.filter(student => !student.isAbsent && student.totalScore !== null);
    return [...groups.entries()].map(([id, group]) => {
      const maxPoints = group.questions.reduce((sum, question) => sum + question.points, 0);
      const studentRates = attended.map(student => {
        const achieved = group.questions.reduce((sum, question) => sum + Number(student.questionScores.find(score => score.questionId === question.id)?.achievedScore || 0), 0);
        return maxPoints ? achieved / maxPoints * 100 : 0;
      });
      const masteryRate = studentRates.length ? studentRates.reduce((sum, value) => sum + value, 0) / studentRates.length : 0;
      const totalAnswers = attended.length * group.questions.length;
      const unanswered = attended.reduce((sum, student) => sum + group.questions.filter(question => !student.questionScores.some(score => score.questionId === question.id && score.achievedScore !== null && score.achievedScore !== undefined)).length, 0);
      return {
        id, name: group.name || 'غير مصنف', questionCount: group.questions.length, maxPoints,
        averagePerformance: masteryRate, masteryRate,
        masteredStudents: studentRates.filter(rate => rate >= 70).length,
        supportStudents: studentRates.filter(rate => rate < 55).length,
        unansweredRate: totalAnswers ? unanswered / totalAnswers * 100 : 0,
        level: this.classify(masteryRate, levels),
      };
    }).sort((a, b) => b.masteryRate - a.masteryRate);
  }
}
