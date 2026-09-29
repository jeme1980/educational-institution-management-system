import { Injectable } from '@angular/core';
import { BaseApiService } from './base-api.service';
import type { CreateSurveyRequest, CreateSurveyRoundRequest, SurveyDetail, SurveyListResponse, SurveyRound, SurveyStructureResponse, UpdateSurveyRequest, UpdateSurveyRoundRequest } from '../../pages/surveys/models/survey.model';

export class SurveyWriteError extends Error {
  constructor(readonly code: string | null) { super('Survey write request failed.'); }
}

@Injectable({ providedIn: 'root' })
export class SurveysApiService extends BaseApiService {
  async getSurveys(academicYearId: string): Promise<SurveyListResponse> {
    const query = new URLSearchParams({ academicYearId });
    const response = await this.apiFetch(`/api/surveys?${query.toString()}`);
    if (!response.ok) throw new Error('Survey list request failed.');
    const items: unknown = await response.json();
    if (!Array.isArray(items)) throw new Error('Unexpected survey list response.');
    return items as SurveyListResponse;
  }


  async createSurvey(payload: CreateSurveyRequest): Promise<SurveyDetail> {
    return this.writeSurvey<SurveyDetail>('/api/surveys', 'POST', payload);
  }

  async updateSurvey(surveyId: string, payload: UpdateSurveyRequest): Promise<SurveyDetail> {
    return this.writeSurvey<SurveyDetail>(`/api/surveys/${encodeURIComponent(surveyId)}`, 'PATCH', payload);
  }

  async getSurveyStructure(surveyId: string): Promise<SurveyStructureResponse> {
    const response = await this.apiFetch(`/api/surveys/${encodeURIComponent(surveyId)}/structure`);
    if (!response.ok) throw new Error('Survey structure request failed.');
    return response.json() as Promise<SurveyStructureResponse>;
  }

  async createSurveyRound(surveyId: string, payload: CreateSurveyRoundRequest): Promise<SurveyRound> {
    return this.writeSurvey<SurveyRound>(`/api/surveys/${encodeURIComponent(surveyId)}/rounds`, 'POST', payload);
  }

  async updateSurveyRound(surveyId: string, roundId: string, payload: UpdateSurveyRoundRequest): Promise<SurveyRound> {
    return this.writeSurvey<SurveyRound>(`/api/surveys/${encodeURIComponent(surveyId)}/rounds/${encodeURIComponent(roundId)}`, 'PATCH', payload);
  }

  private async writeSurvey<T>(path: string, method: 'POST' | 'PATCH', payload: CreateSurveyRequest | UpdateSurveyRequest | CreateSurveyRoundRequest | UpdateSurveyRoundRequest): Promise<T> {
    const response = await this.apiFetch(path, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
    if (!response.ok) {
      const body: unknown = await response.json().catch(() => null);
      const code = body && typeof body === 'object' && 'code' in body && typeof body.code === 'string' ? body.code : null;
      throw new SurveyWriteError(code);
    }
    return response.json() as Promise<T>;
  }
}
