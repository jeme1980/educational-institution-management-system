import { describe, expect, it } from 'vitest';
import { SETTINGS_NAV_ITEMS, filterSettingsNavItems } from './settings-navigation';

describe('SettingsComponent navigation', () => {
  it('shows the academic year rollover entry with its canonical route when settings access is allowed', () => {
    const visibleItems = filterSettingsNavItems(SETTINGS_NAV_ITEMS, () => true);

    expect(visibleItems).toContainEqual(expect.objectContaining({
      label: 'ترفيع السنة الدراسية',
      path: '/academic-years/rollover',
      permission: 'settings:read',
    }));
  });

  it('hides the academic year rollover entry without settings access', () => {
    const visibleItems = filterSettingsNavItems(SETTINGS_NAV_ITEMS, (permission) => permission !== 'settings:read');

    expect(visibleItems.some((item) => item.path === '/academic-years/rollover')).toBe(false);
  });
});
