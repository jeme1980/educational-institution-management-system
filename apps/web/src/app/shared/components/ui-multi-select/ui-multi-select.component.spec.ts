import { Component } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import { UiMultiSelectComponent, UiMultiSelectOption } from './ui-multi-select.component';

@Component({
  standalone: true,
  imports: [UiMultiSelectComponent],
  template: `<ui-multi-select
    [options]="options"
    [selectedIds]="selectedIds"
    (selectedIdsChange)="selectedIds = $event"
    ariaLabel="اختيار المراحل"
    allLabel="كل المراحل"
    countLabel="مراحل"
  />`,
})
class MultiSelectHostComponent {
  options: UiMultiSelectOption[] = [
    { id: 'grade-a', label: 'المرحلة الأولى' },
    { id: 'grade-b', label: 'المرحلة الثانية' },
    { id: 'grade-c', label: 'المرحلة الثالثة' },
  ];
  selectedIds = ['ALL'];
}

describe('UiMultiSelectComponent DOM contract', () => {
  let fixture: ComponentFixture<MultiSelectHostComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [MultiSelectHostComponent] }).compileComponents();
    fixture = TestBed.createComponent(MultiSelectHostComponent);
    fixture.detectChanges();
  });

  it('opens from the real trigger and exposes its accessibility state', () => {
    const trigger = fixture.nativeElement.querySelector('.multi-select__trigger') as HTMLButtonElement;
    expect(trigger.type).toBe('button');
    expect(trigger.getAttribute('aria-expanded')).toBe('false');

    trigger.click();
    fixture.detectChanges();

    expect(trigger.getAttribute('aria-expanded')).toBe('true');
    expect(fixture.nativeElement.querySelector('.multi-select__panel')).not.toBeNull();
    expect(fixture.nativeElement.querySelectorAll('.multi-select__options input')).toHaveLength(3);
  });

  it('keeps the panel open for multiple selections and updates the trigger summary', () => {
    const trigger = fixture.nativeElement.querySelector('.multi-select__trigger') as HTMLButtonElement;
    trigger.click(); fixture.detectChanges();
    const inputs = fixture.nativeElement.querySelectorAll('.multi-select__options input') as NodeListOf<HTMLInputElement>;

    inputs[0].click(); fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.multi-select__panel')).not.toBeNull();
    expect(trigger.textContent).toContain('المرحلة الأولى');

    inputs[1].click(); fixture.detectChanges();
    inputs[2].click(); fixture.detectChanges();
    expect(fixture.componentInstance.selectedIds).toEqual(['grade-a', 'grade-b', 'grade-c']);
    expect(trigger.textContent).toContain('3 مراحل');
    expect(fixture.nativeElement.querySelector('.multi-select__panel')).not.toBeNull();
  });

  it('supports All and closes only on outside click or Escape', () => {
    const trigger = fixture.nativeElement.querySelector('.multi-select__trigger') as HTMLButtonElement;
    trigger.click(); fixture.detectChanges();
    (fixture.nativeElement.querySelector('.multi-select__all input') as HTMLInputElement).click();
    fixture.detectChanges();
    expect(fixture.componentInstance.selectedIds).toEqual(['ALL']);
    expect(fixture.nativeElement.querySelector('.multi-select__panel')).not.toBeNull();

    document.body.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.multi-select__panel')).toBeNull();

    trigger.click(); fixture.detectChanges();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.multi-select__panel')).toBeNull();
  });
});
