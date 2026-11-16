// Role gates for the account-menu Settings group (NavigationBar) and the
// Settings page itself. Single source of truth so the menu and the page
// can never disagree about who sees User Management.
//
// canManageUsers mirrors exactly the roles that used to see the
// "User Management" tab in their portal tab bar: ADMIN, the org role, or
// the org's Portal Administrator. Officer sub-roles never had that tab
// and do not get the menu item or the section either.
export function canManageUsers(role: string | undefined | null): boolean {
  if (!role) return false;
  if (role === 'ADMIN') return true;
  if (['ECTA', 'ECX', 'NBE', 'BANKS', 'CUSTOMS', 'SHIPPING'].includes(role)) return true;
  return role.endsWith(' Portal Administrator');
}

// System Management (audit trail + links to the system areas) is open to
// every signed-in role: the Audit Trail tab used to sit on all 7 portals,
// including Exporter. Its admin-only links are gated separately, in the
// Settings page, by role.
export function canSeeSystemLinks(role: string | undefined | null): boolean {
  return role === 'ADMIN' || role === 'CUSTOMS';
}
