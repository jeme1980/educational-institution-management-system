import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const componentPath = resolve(process.cwd(), 'src/app/pages/interventions/pages');
const template = readFileSync(resolve(componentPath, 'interventions.component.html'), 'utf8');
const source = readFileSync(resolve(componentPath, 'interventions.component.ts'), 'utf8');

describe('Interventions workspace actions', () => {
  it('wires the new-plan button to the existing create route', () => {
    expect(template).toContain('(activated)="openCreate()"');
    expect(source).toContain('openCreate(): void');
    expect(source).toContain("this.router.navigate(['/exam-analysis'], { queryParams: { tab: 'intervention' } })");
  });
});
