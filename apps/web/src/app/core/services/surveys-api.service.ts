import { Injectable } from '@angular/core';
import { BaseApiService } from './base-api.service';
import type { CreateSurveyDomainRequest, CreateSurveyIndicatorRequest, CreateSurveyRequest, CreateSurveyRoundRequest, CreateSurveySectionRequest, CreateSurveySegmentRequest, SurveyDetail, SurveyDomain, SurveyIndicator, SurveyListResponse, SurveyResultsImportResponse, SurveyResultsPreviewResponse, SurveyRound, SurveyRoundResultsResponse, SurveySection, SurveySegment, SurveyStructureResponse, UpdateSurveyDomainRequest, UpdateSurveyIndicatorRequest, UpdateSurveyRequest, UpdateSurveyRoundRequest, UpdateSurveySectionRequest, UpdateSurveySegmentRequest } from '../../pages/surveys/models/survey.model';

export class SurveyWriteError extends Error {
  constructor(readonly code: string | null) { super('Survey write request failed.'); }
}

export class SurveyPreviewError extends Error {
  constructor(readonly code: string | null) { super('Survey preview request failed.'); }
}

export class SurveyImportError extends Error {
  constructor(readonly code: string | null) { super('Survey import request failed.'); }
}

export class SurveyResultsReadError extends Error {
  constructor(readonly code: string | null, readonly status: number) { super('Survey results read request failed.'); }
}

@Injectable({ providedIn: 'root' })
export class SurveysApiService extends BaseApiService {
  async downloadSurveyResultsTemplate(): Promise<Blob> {
    const response = await this.apiFetch('/api/surveys/results/template');
    if (!response.ok) throw new Error('Survey results template request failed.');
    return response.blob();
  }

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

  async getSurveyRoundResults(surveyId: string, roundId: string): Promise<SurveyRoundResultsResponse> {
    const response = await this.apiFetch(`/api/surveys/${encodeURIComponent(surveyId)}/rounds/${encodeURIComponent(roundId)}/results`);
    if (!response.ok) {
      const body: unknown = await response.json().catch(() => null);
      const error = body && typeof body === 'object' && 'error' in body ? body.error : null;
      const code = error && typeof error === 'object' && 'code' in error && typeof error.code === 'string' ? error.code : null;
      throw new SurveyResultsReadError(code, response.status);
    }
    return response.json() as Promise<SurveyRoundResultsResponse>;
  }

  async createSurveySection(surveyId: string, payload: CreateSurveySectionRequest): Promise<SurveySection> {
    return this.writeSurvey<SurveySection>(`/api/surveys/${encodeURIComponent(surveyId)}/sections`, 'POST', payload);
  }

  async updateSurveySection(surveyId: string, sectionId: string, payload: UpdateSurveySectionRequest): Promise<SurveySection> {
    return this.writeSurvey<SurveySection>(`/api/surveys/${encodeURIComponent(surveyId)}/sections/${encodeURIComponent(sectionId)}`, 'PATCH', payload);
  }

  async createSurveyDomain(surveyId: string, payload: CreateSurveyDomainRequest): Promise<SurveyDomain> {
    return this.writeSurvey<SurveyDomain>(`/api/surveys/${encodeURIComponent(surveyId)}/domains`, 'POST', payload);
  }

  async updateSurveyDomain(surveyId: string, domainId: string, payload: UpdateSurveyDomainRequest): Promise<SurveyDomain> {
    return this.writeSurvey<SurveyDomain>(`/api/surveys/${encodeURIComponent(surveyId)}/domains/${encodeURIComponent(domainId)}`, 'PATCH', payload);
  }

  async createSurveyIndicator(surveyId: string, payload: CreateSurveyIndicatorRequest): Promise<SurveyIndicator> {
    return this.writeSurvey<SurveyIndicator>(`/api/surveys/${encodeURIComponent(surveyId)}/indicators`, 'POST', payload);
  }

  async updateSurveyIndicator(surveyId: string, indicatorId: string, payload: UpdateSurveyIndicatorRequest): Promise<SurveyIndicator> {
    return this.writeSurvey<SurveyIndicator>(`/api/surveys/${encodeURIComponent(surveyId)}/indicators/${encodeURIComponent(indicatorId)}`, 'PATCH', payload);
  }

  async createSurveySegment(surveyId: string, payload: CreateSurveySegmentRequest): Promise<SurveySegment> {
    return this.writeSurvey<SurveySegment>(`/api/surveys/${encodeURIComponent(surveyId)}/segments`, 'POST', payload);
  }

  async updateSurveySegment(surveyId: string, segmentId: string, payload: UpdateSurveySegmentRequest): Promise<SurveySegment> {
    return this.writeSurvey<SurveySegment>(`/api/surveys/${encodeURIComponent(surveyId)}/segments/${encodeURIComponent(segmentId)}`, 'PATCH', payload);
  }

  async previewSurveyResults(surveyId: string, roundId: string, file: File): Promise<SurveyResultsPreviewResponse> {
    const form = new FormData();
    form.append('file', file);
    const response = await this.apiFetch(`/api/surveys/${encodeURIComponent(surveyId)}/rounds/${encodeURIComponent(roundId)}/results/preview`, { method: 'POST', body: form });
    if (!response.ok) {
      const body: unknown = await response.json().catch(() => null);
      const error = body && typeof body === 'object' && 'error' in body ? body.error : null;
      const code = error && typeof error === 'object' && 'code' in error && typeof error.code === 'string' ? error.code : null;
      throw new SurveyPreviewError(code);
    }
    return response.json() as Promise<SurveyResultsPreviewResponse>;
  }

  async importSurveyResults(surveyId: string, roundId: string, file: File): Promise<SurveyResultsImportResponse> {
    const form = new FormData();
    form.append('file', file);
    const response = await this.apiFetch(`/api/surveys/${encodeURIComponent(surveyId)}/rounds/${encodeURIComponent(roundId)}/results/import`, { method: 'POST', body: form });
    if (!response.ok) {
      const body: unknown = await response.json().catch(() => null);
      const error = body && typeof body === 'object' && 'error' in body ? body.error : null;
      const code = error && typeof error === 'object' && 'code' in error && typeof error.code === 'string' ? error.code : null;
      throw new SurveyImportError(code);
    }
    return response.json() as Promise<SurveyResultsImportResponse>;
  }

  private async writeSurvey<T>(path: string, method: 'POST' | 'PATCH', payload: CreateSurveyRequest | UpdateSurveyRequest | CreateSurveyRoundRequest | UpdateSurveyRoundRequest | CreateSurveySectionRequest | UpdateSurveySectionRequest | CreateSurveyDomainRequest | UpdateSurveyDomainRequest | CreateSurveyIndicatorRequest | UpdateSurveyIndicatorRequest | CreateSurveySegmentRequest | UpdateSurveySegmentRequest): Promise<T> {
    const response = await this.apiFetch(path, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
    if (!response.ok) {
      const body: unknown = await response.json().catch(() => null);
      const code = body && typeof body === 'object' && 'code' in body && typeof body.code === 'string' ? body.code : null;
      throw new SurveyWriteError(code);
    }
    return response.json() as Promise<T>;
  }
}
