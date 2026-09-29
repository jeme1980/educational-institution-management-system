import { Injectable } from '@angular/core';
import { BaseApiService } from './base-api.service';
import type { CreateSurveyRequest, SurveyDetail, SurveyListResponse, UpdateSurveyRequest } from '../../pages/surveys/models/survey.model';

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
    return this.writeSurvey('/api/surveys', 'POST', payload);
  }

  async updateSurvey(surveyId: string, payload: UpdateSurveyRequest): Promise<SurveyDetail> {
    return this.writeSurvey(`/api/surveys/${encodeURIComponent(surveyId)}`, 'PATCH', payload);
  }

  private async writeSurvey(path: string, method: 'POST' | 'PATCH', payload: CreateSurveyRequest | UpdateSurveyRequest): Promise<SurveyDetail> {
    const response = await this.apiFetch(path, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
    if (!response.ok) {
      const body: unknown = await response.json().catch(() => null);
      const code = body && typeof body === 'object' && 'code' in body && typeof body.code === 'string' ? body.code : null;
      throw new SurveyWriteError(code);
    }
    return response.json() as Promise<SurveyDetail>;
  }
}
