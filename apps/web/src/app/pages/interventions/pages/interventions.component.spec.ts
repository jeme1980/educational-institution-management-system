import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const template = readFileSync(new URL('./interventions.component.html', import.meta.url), 'utf8');
const source = readFileSync(new URL('./interventions.component.ts', import.meta.url), 'utf8');

describe('Interventions workspace actions', () => {
  it('wires the new-plan button to the existing create route', () => {
    expect(template).toContain('(activated)="openCreate()"');
    expect(source).toContain('openCreate(): void');
    expect(source).toContain("this.router.navigate(['/interventions/new'])");
  });
});

