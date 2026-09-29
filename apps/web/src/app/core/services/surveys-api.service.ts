import { Injectable } from '@angular/core';
import { BaseApiService } from './base-api.service';
import type { SurveyListResponse } from '../../pages/surveys/models/survey.model';

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
}
