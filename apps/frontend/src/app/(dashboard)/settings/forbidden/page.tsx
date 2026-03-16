export default function ForbiddenPage() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '60vh' }}>
      <h1 style={{ fontSize: '4rem', margin: 0 }}>403</h1>
      <h2 style={{ margin: '0.5rem 0' }}>Access Denied</h2>
      <p style={{ color: '#64748b' }}>You do not have permission to view this page.</p>
      <a href="/dashboard" style={{ marginTop: '1rem', color: '#3b82f6' }}>Go to Dashboard</a>
    </div>
  );
}
