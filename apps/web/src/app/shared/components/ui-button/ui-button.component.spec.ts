import { Component } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { UiButtonComponent } from './ui-button.component';

@Component({
  standalone: true,
  imports: [UiButtonComponent],
  template: '<ui-button type="submit" form="reference-data-form" (activated)="activated = true">حفظ</ui-button>',
})
class ButtonHostComponent {
  activated = false;
}

describe('UiButtonComponent DOM contract', () => {
  let fixture: ComponentFixture<ButtonHostComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [ButtonHostComponent] }).compileComponents();
    fixture = TestBed.createComponent(ButtonHostComponent);
    fixture.detectChanges();
  });

  it('forwards native submit and form attributes and emits on a real click', () => {
    const button = fixture.nativeElement.querySelector('button') as HTMLButtonElement;

    expect(button.type).toBe('submit');
    expect(button.getAttribute('form')).toBe('reference-data-form');
    button.click();
    fixture.detectChanges();

    expect(fixture.componentInstance.activated).toBe(true);
  });
});
