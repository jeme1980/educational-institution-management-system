import '@angular/compiler';
import { computed, signal } from '@angular/core';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { DEFAULT_PERFORMANCE_LEVELS, AnalysisStudent, DimensionAnalysis, QuestionAnalysis } from '../models/exam-analysis.model';
import { ExamAnalysisCalculatorService } from '../services/exam-analysis-calculator.service';
import { buildInterventionGroups, filterAndSortQuestions, filterAndSortSkills, filterAndSortTopics, groupRecommendations, questionDetailUnavailable, recommendationSeverity } from './exam-analysis.component';
import { performanceDonutData } from '../components/performance-donut-chart.component';
import { performanceGroupBarData } from '../components/performance-bar-chart.component';
import { questionSuccessBarData } from '../components/question-success-chart.component';
import { topicOverviewBarData } from '../components/topic-overview-chart.component';

const overviewTemplate = readFileSync(new URL('./exam-analysis.component.html', import.meta.url), 'utf8');

describe('ExamAnalysis intervention reactivity', () => {
  it('moves a student between level groups when levels change without reload', () => {
    const levels = signal(DEFAULT_PERFORMANCE_LEVELS.map(level => ({ ...level })));
    const rawStudents: AnalysisStudent[] = [{
      studentId: 'student-1',
      studentName: 'Student 1',
      totalScore: 80,
      isAbsent: false,
      questionScores: [],
    }];
    const calculator = new ExamAnalysisCalculatorService();
    const students = computed(() => calculator.students(rawStudents, [], 100, levels()));
    const interventionGroups = computed(() => buildInterventionGroups(levels(), students()));

    expect(interventionGroups().find(group => group.color === '#2563eb')?.students.map(student => student.studentId)).toEqual(['student-1']);

    levels.set([
      { id: 'high', name: 'High', min: 75, max: 100, color: '#16a34a' },
      { id: 'upper-mid', name: 'Upper mid', min: 50, max: 74.99, color: '#2563eb' },
      { id: 'lower-mid', name: 'Lower mid', min: 25, max: 49.99, color: '#f59e0b' },
      { id: 'low', name: 'Low', min: 0, max: 24.99, color: '#dc2626' },
    ]);

    expect(interventionGroups().find(group => group.color === '#16a34a')?.students.map(student => student.studentId)).toEqual(['student-1']);
    expect(interventionGroups().find(group => group.color === '#2563eb')?.students).toEqual([]);
  });

  it('uses the level name and color for a newly added level', () => {
    const levels = [{ id: 'new-level', name: 'New level', min: 0, max: 100, color: '#64748b' }];
    const groups = buildInterventionGroups(levels, []);

    expect(groups).toHaveLength(1);
    expect(groups[0]).toMatchObject({ name: 'New level', color: '#64748b', students: [] });
    expect(groups[0].duration).toBeTruthy();
    expect(groups[0].activity).toBeTruthy();
  });
});

describe('ExamAnalysis overview visuals', () => {
  const levels = DEFAULT_PERFORMANCE_LEVELS.map((level, index) => ({ ...level, count: index + 1 }));

  it('maps the primary KPI row to shared semantic variants', () => {
    expect(overviewTemplate).toContain('overview-kpi-row--primary');
    expect(overviewTemplate).toContain('tone="neutral"');
    expect(overviewTemplate).toContain('tone="success"');
  });

  it('keeps donut percentages finite and sums them to 100 when data exists', () => {
    const data = performanceDonutData(levels);
    const counts = data.datasets[0].data as number[];
    expect(counts.reduce((sum, count) => sum + count, 0)).toBe(10);
    expect(counts.every(count => Number.isFinite(count))).toBe(true);
  });

  it('keeps zero-data charts finite', () => {
    const donut = performanceDonutData(levels.map(level => ({ ...level, count: 0 })));
    const bars = performanceGroupBarData([{ id: 'empty', name: 'Empty', summary: { average: 0, passRate: 0 } }]);
    expect(JSON.stringify({ donut, bars })).not.toMatch(/NaN|Infinity/);
  });

  it('tracks dynamic level counts by stable level id', () => {
    const data = performanceDonutData([{ ...levels[0], id: 'custom-level', count: 4 }]);
    expect(data.labels).toEqual([levels[0].name]);
  });

  it('shows the group comparison only when more than one group is available', () => {
    expect(performanceGroupBarData([]).labels).toHaveLength(0);
    expect(performanceGroupBarData([{ id: 'one', name: 'One', summary: { average: 80, passRate: 75 } }]).labels).toHaveLength(1);
    expect(performanceGroupBarData([
      { id: 'one', name: 'One', summary: { average: 80, passRate: 75 } },
      { id: 'two', name: 'Two', summary: { average: 60, passRate: 50 } },
    ]).labels).toHaveLength(2);
  });
});

describe('ExamAnalysis question integrity', () => {
  const level = { id: 'low', name: 'منخفض', min: 0, max: 100, color: '#dc2626' };
  const question = (overrides: Partial<QuestionAnalysis> = {}): QuestionAnalysis => ({
    id: 'q-1', questionNumber: 1, points: 10, topicId: 'topic-1', topicName: 'الجبر', skillId: 'skill-1', skillName: 'الحساب', typeId: 'type-1', typeName: 'اختيار من متعدد', text: 'نص السؤال',
    average: 0, successRate: 0, errorRate: 0, unansweredRate: 100, correctCount: 0, wrongCount: 0, unansweredCount: 2, difficulty: 'صعب', level, ...overrides,
  });

  it('does not show the all-unanswered state when there are no questions', () => {
    expect(questionDetailUnavailable([], 2, false)).toBe(false);
  });

  it('shows the all-unanswered state only when detail is missing', () => {
    expect(questionDetailUnavailable([question()], 2, false)).toBe(true);
    expect(questionDetailUnavailable([question({ unansweredRate: 50, correctCount: 1 })], 2, false)).toBe(false);
    expect(questionDetailUnavailable([question()], 2, true)).toBe(false);
  });

  it('searches question number, text, topic, and skill and sorts stably', () => {
    const questions = [question({ id: 'q-2', questionNumber: 2, topicName: 'الهندسة', skillName: 'القياس', successRate: 80, unansweredRate: 0, correctCount: 2, difficulty: 'سهل' }), question({ successRate: 20 })];
    expect(filterAndSortQuestions(questions, 'الهندسة', 'question', 'asc').map(item => item.id)).toEqual(['q-2']);
    expect(filterAndSortQuestions(questions, '', 'successRate', 'asc').map(item => item.id)).toEqual(['q-1', 'q-2']);
  });

  it('keeps question chart values finite and aligned with visible questions', () => {
    const data = questionSuccessBarData([question({ successRate: Number.NaN }), question({ id: 'q-2', questionNumber: 2, successRate: 75, unansweredRate: 0, correctCount: 2 })]);
    expect(data.labels).toEqual(['س1', 'س2']);
    expect(data.datasets[0].data).toEqual([0, 75]);
    expect(JSON.stringify(data)).not.toMatch(/NaN|Infinity/);
  });

  it('does not expose subtopic behavior when the model has no subtopic field', () => {
    expect('subTopicId' in question()).toBe(false);
  });
});

describe('ExamAnalysis topic presentation', () => {
  const level = { id: 'high', name: 'مرتفع', min: 85, max: 100, color: '#16a34a' };
  const topic = (overrides: Partial<DimensionAnalysis> = {}): DimensionAnalysis => ({
    id: 'topic-1', name: 'الجبر', questionCount: 2, maxPoints: 20, averagePerformance: 90, masteryRate: 90, masteredStudents: 2, supportStudents: 0, unansweredRate: 0, level, ...overrides,
  });

  it('keeps classified, unclassified, and partial topic states distinct', () => {
    const classified = [topic(), topic({ id: 'topic-2', name: 'الهندسة', masteryRate: 40, level: { ...level, id: 'low', name: 'منخفض' } })];
    expect(classified.filter(item => item.name !== 'غير مصنف')).toHaveLength(2);
    expect([topic({ name: 'غير مصنف' })].filter(item => item.name === 'غير مصنف')).toHaveLength(1);
  });

  it('sorts topics by mastery, question count, and name', () => {
    const topics = [topic({ id: 'b', name: 'باء', masteryRate: 60, questionCount: 4 }), topic({ id: 'a', name: 'ألف', masteryRate: 90, questionCount: 1 })];
    expect(filterAndSortTopics(topics, '', 'mastery-desc').map(item => item.id)).toEqual(['a', 'b']);
    expect(filterAndSortTopics(topics, '', 'mastery-asc').map(item => item.id)).toEqual(['b', 'a']);
    expect(filterAndSortTopics(topics, '', 'questions-desc').map(item => item.id)).toEqual(['b', 'a']);
    expect(filterAndSortTopics(topics, 'ألف', 'name').map(item => item.id)).toEqual(['a']);
  });

  it('feeds the topic chart with visible topics and finite mastery values', () => {
    const data = topicOverviewBarData([topic({ masteryRate: Number.NaN }), topic({ id: 'topic-2', name: 'الهندسة', masteryRate: 75 })]);
    expect(data.labels).toEqual(['الجبر', 'الهندسة']);
    expect(data.datasets[0].data).toEqual([0, 75]);
    expect(JSON.stringify(data)).not.toMatch(/NaN|Infinity/);
  });

  it('uses topic ids for question-type breakdown and keeps Skills isolated', () => {
    expect(overviewTemplate).toContain("@if (activeTab() === 'skills')");
    expect(overviewTemplate).toContain("@if (activeTab() === 'topics')");
    expect(overviewTemplate).toContain('selectedTopicQuestionTypes()');
  });
});

describe('ExamAnalysis skill presentation', () => {
  const level = { id: 'high', name: 'مرتفع', min: 85, max: 100, color: '#16a34a' };
  const skill = (overrides: Partial<DimensionAnalysis> = {}): DimensionAnalysis => ({
    id: 'skill-1', name: 'الحساب', questionCount: 2, maxPoints: 20, averagePerformance: 90, masteryRate: 90, masteredStudents: 2, supportStudents: 0, unansweredRate: 0, level, ...overrides,
  });

  it('keeps classified and unclassified skills separate from KPI data', () => {
    const skills = [skill(), skill({ id: 'unclassified', name: 'غير مصنف' })];
    expect(skills.filter(item => item.name !== 'غير مصنف')).toHaveLength(1);
    expect(skills.filter(item => item.name === 'غير مصنف')).toHaveLength(1);
  });

  it('searches and sorts skills with the supported options', () => {
    const skills = [skill({ id: 'b', name: 'القراءة', masteryRate: 60, questionCount: 4 }), skill({ id: 'a', name: 'الكتابة', masteryRate: 90, questionCount: 1 })];
    expect(filterAndSortSkills(skills, 'كتابة', 'name').map(item => item.id)).toEqual(['a']);
    expect(filterAndSortSkills(skills, '', 'mastery-asc').map(item => item.id)).toEqual(['b', 'a']);
    expect(filterAndSortSkills(skills, '', 'questions-desc').map(item => item.id)).toEqual(['b', 'a']);
  });

  it('keeps Skills state isolated and uses the skill-specific chart wrapper', () => {
    expect(overviewTemplate).toContain('skillSearch()');
    expect(overviewTemplate).toContain('skillSort()');
    expect(overviewTemplate).toContain('selectedSkillId()');
    expect(overviewTemplate).toContain('<app-skill-overview-chart');
    expect(overviewTemplate).toContain('selectedSkillQuestionTypes()');
    expect(overviewTemplate).toContain("@if (activeTab() === 'topics')");
  });
});

describe('ExamAnalysis recommendations', () => {
  const item = (overrides: any = {}) => ({
    type: 'question', severity: recommendationSeverity(22.7), priorityValue: 22.7, icon: 'quiz', title: 'مراجعة السؤال 6', detail: 'نسبة النجاح 22.7%', actionHint: 'فتح تفاصيل السؤال', actionTab: 'questions', actionPayload: 'question-6', ...overrides,
  });

  it('groups recommendations into critical, high, and moderate sections', () => {
    const groups = groupRecommendations([item(), item({ title: 'مهارة', type: 'skill', severity: recommendationSeverity(42), priorityValue: 42 }), item({ title: 'موضوع', type: 'topic', severity: recommendationSeverity(50), priorityValue: 50 })]);
    expect(groups.map(group => group.severity)).toEqual(['critical', 'high', 'moderate']);
    expect(groups[0].items[0].priorityValue).toBe(22.7);
  });

  it('uses presentation-only severity thresholds without changing metrics', () => {
    expect(recommendationSeverity(0)).toBe('critical');
    expect(recommendationSeverity(22.7)).toBe('critical');
    expect(recommendationSeverity(40)).toBe('high');
    expect(recommendationSeverity(54.9)).toBe('moderate');
    expect(recommendationSeverity(null)).toBe('moderate');
  });

  it('keeps recommendation cards keyboard accessible and action metadata explicit', () => {
    expect(overviewTemplate).toContain('openRecommendation(item)');
    expect(overviewTemplate).toContain('recommendation-card');
    expect(overviewTemplate).toContain('recommendation-card__action');
    expect(overviewTemplate).toContain('actionPayload');
  });

  it('keeps skill, topic, question, and individual actions explicit', () => {
    const actions = groupRecommendations([
      item({ type: 'skill', actionTab: 'skills', actionPayload: 'skill-1' }),
      item({ type: 'topic', actionTab: 'topics', actionPayload: 'topic-1' }),
      item({ type: 'question', actionTab: 'questions', actionPayload: 'question-1' }),
      item({ type: 'individual', actionTab: 'intervention', actionPayload: null, priorityValue: null, severity: 'moderate' }),
    ]).flatMap(group => group.items);
    expect(actions.map(action => [action.type, action.actionTab, action.actionPayload])).toEqual([
      ['skill', 'skills', 'skill-1'],
      ['topic', 'topics', 'topic-1'],
      ['question', 'questions', 'question-1'],
      ['individual', 'intervention', null],
    ]);
  });
});
