import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { AuthService } from '../../../core/services/auth.service';
import { RolloverApiService } from './rollover-api.service';

describe('RolloverApiService createDraft', () => {
  it('preserves the ACTIVE_DRAFT_EXISTS body from a 409 response', async () => {
    TestBed.configureTestingModule({ providers: [
      RolloverApiService,
      { provide: AuthService, useValue: {} },
      { provide: Router, useValue: {} },
    ] });
    const service = TestBed.inject(RolloverApiService);
    vi.spyOn(service, 'apiFetch').mockResolvedValue(new Response(JSON.stringify({ code: 'ACTIVE_DRAFT_EXISTS', existingRolloverId: 'draft-1' }), { status: 409, headers: { 'Content-Type': 'application/json' } }));

    const result = await service.createDraft('source', 'target');

    expect(result.status).toBe(409);
    expect(result.body).toEqual({ code: 'ACTIVE_DRAFT_EXISTS', existingRolloverId: 'draft-1' });
  });
});
