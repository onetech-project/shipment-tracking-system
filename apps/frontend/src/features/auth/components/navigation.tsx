'use client';
// Navigation is now handled by DashboardShell → Sidebar + MobileDrawer
import { Sidebar } from '@/components/layout/sidebar';

export default function Navigation() {
  return <Sidebar />;
}
import Link from 'next/link';
import { useAuth } from '@/features/auth/auth.context';
import { usePermissions } from '@/shared/hooks/use-permissions';

const linkStyle = { color: '#94a3b8', textDecoration: 'none', display: 'block', padding: '4px 0' };
const sectionStyle = { marginTop: '1.5rem' };
const subLinkStyle = { ...linkStyle, paddingLeft: '1rem', fontSize: '0.875rem' };

export default function Navigation() {
  const { logout } = useAuth();
  const { isSuperAdmin, isAdminOrAbove } = usePermissions();

  return (
    <nav style={{ width: 240, padding: '1rem', background: '#1e293b', color: '#fff', minHeight: '100vh', boxSizing: 'border-box' }}>
      <h2 style={{ marginTop: 0, fontSize: '1rem', color: '#f8fafc' }}>Shipment Tracker</h2>

      <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
        <li><Link href="/dashboard" style={linkStyle}>Dashboard</Link></li>

        <li style={sectionStyle}>
          <span style={{ color: '#64748b', fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Shipments</span>
          <ul style={{ listStyle: 'none', padding: 0, margin: '0.5rem 0 0' }}>
            <li><Link href="/shipments/upload" style={subLinkStyle}>Import PDF</Link></li>
            <li><Link href="/shipments/history" style={subLinkStyle}>Upload History</Link></li>
            <li><Link href="/shipments/scan" style={subLinkStyle}>QR Scan</Link></li>
          </ul>
        </li>

        {isAdminOrAbove && (
          <li style={sectionStyle}>
            <span style={{ color: '#64748b', fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Settings</span>
            <ul style={{ listStyle: 'none', padding: 0, margin: '0.5rem 0 0' }}>
              {isSuperAdmin && (
                <li><Link href="/settings/organizations" style={subLinkStyle}>Organizations</Link></li>
              )}
              <li><Link href="/settings/roles" style={subLinkStyle}>Roles</Link></li>
              <li><Link href="/settings/users" style={subLinkStyle}>Users</Link></li>
              <li><Link href="/settings/invitations" style={subLinkStyle}>Invitations</Link></li>
              {isSuperAdmin && (
                <li><Link href="/settings/permissions" style={subLinkStyle}>Permissions</Link></li>
              )}
            </ul>
          </li>
        )}

        {isSuperAdmin && (
          <li style={sectionStyle}>
            <Link href="/audit" style={linkStyle}>Audit Logs</Link>
          </li>
        )}
      </ul>

      <div style={{ position: 'absolute', bottom: '1rem' }}>
        <button
          onClick={() => logout()}
          style={{ background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer', padding: 0 }}
        >
          Sign out
        </button>
      </div>
    </nav>
  );
}
