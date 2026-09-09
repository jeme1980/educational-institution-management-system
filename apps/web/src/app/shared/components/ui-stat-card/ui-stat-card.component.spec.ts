import { ComponentFixture, TestBed } from '@angular/core/testing';
import { UiStatCardComponent } from './ui-stat-card.component';

describe('UiStatCardComponent icon contract', () => {
  let fixture: ComponentFixture<UiStatCardComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [UiStatCardComponent] }).compileComponents();
    fixture = TestBed.createComponent(UiStatCardComponent);
    fixture.componentRef.setInput('label', 'إجمالي السجلات');
    fixture.componentRef.setInput('value', 12);
    fixture.componentRef.setInput('icon', 'analytics');
    fixture.detectChanges();
  });

  it('renders its decorative icon through the single statistic icon element', () => {
    const article = fixture.nativeElement.querySelector('article') as HTMLElement;
    const iconContainer = article.querySelector('.ui-stat-card__icon') as HTMLElement;
    const icon = iconContainer.querySelector('mat-icon') as HTMLElement;

    expect(article.className).toBe('ui-stat-card');
    expect(icon.getAttribute('aria-hidden')).toBe('true');
  });

  it('does not add a color variant when the semantic tone changes', () => {
    fixture.componentRef.setInput('tone', 'warning');
    fixture.detectChanges();

    expect((fixture.nativeElement.querySelector('article') as HTMLElement).className).toBe('ui-stat-card');
  });
});
