export interface SettingsNavItem {
  path: string;
  label: string;
  icon: string;
  permission: string;
}

export const SETTINGS_NAV_ITEMS: readonly SettingsNavItem[] = [
  { path: '/settings', label: 'إعدادات المؤسسة', icon: 'domain', permission: 'settings:read' },
  { path: '/academic-years/rollover', label: 'ترفيع السنة الدراسية', icon: 'upgrade', permission: 'settings:read' },
  { path: '/settings/users', label: 'المستخدمون', icon: 'manage_accounts', permission: 'settings:create' },
  { path: '/settings/roles', label: 'الأدوار والصلاحيات', icon: 'admin_panel_settings', permission: 'settings:create' },
  { path: '/settings/subscription', label: 'الاشتراك', icon: 'card_membership', permission: 'subscription:read' },
  { path: '/settings/lookup-tables', label: 'الجداول المساعدة', icon: 'table_rows', permission: 'settings:create' },
  { path: '/settings/audit-log', label: 'سجل التدقيق', icon: 'history', permission: 'audit:read' },
];

export function filterSettingsNavItems(
  items: readonly SettingsNavItem[],
  hasPermission: (permission: string) => boolean,
): SettingsNavItem[] {
  return items.filter((item) => hasPermission(item.permission));
}
