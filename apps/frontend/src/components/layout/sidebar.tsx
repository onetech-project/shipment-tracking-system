'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useAuth } from '@/features/auth/auth.context'
import { usePermissions } from '@/shared/hooks/use-permissions'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import {
  LayoutDashboard,
  Users,
  Shield,
  Building2,
  Mail,
  Key,
  ClipboardList,
  LogOut,
  Plane,
  TrendingUp,
  ShieldAlert,
  Menu,
} from 'lucide-react'

interface NavLinkProps {
  href: string
  icon: React.ReactNode
  label: string
  onClick?: () => void
  collapsed?: boolean
}

function NavLink({ href, icon, label, onClick, collapsed }: NavLinkProps) {
  const pathname = usePathname()
  const isActive = pathname === href || pathname?.startsWith(href + '/')
  return (
    <Link
      href={href}
      onClick={onClick}
      title={collapsed ? label : undefined}
      className={cn(
        'flex items-center rounded-md py-2 text-sm font-medium motion-safe:transition-colors',
        collapsed ? 'justify-center px-2' : 'gap-3 px-3',
        isActive
          ? 'bg-white/10 text-white'
          : 'text-sidebar-muted hover:bg-white/10 hover:text-white'
      )}
    >
      <span className="h-4 w-4 shrink-0">{icon}</span>
      {!collapsed && label}
    </Link>
  )
}

interface SidebarProps {
  onNavClick?: () => void
  collapsed?: boolean
  onToggleCollapse?: () => void
}

export function Sidebar({ onNavClick, collapsed = false, onToggleCollapse }: SidebarProps) {
  const { logout } = useAuth()
  const { isSuperAdmin, isAdminOrAbove, hasPermission } = usePermissions()

  return (
    <nav data-sidebar className="flex h-full w-full flex-col overflow-hidden bg-sidebar px-3 py-4">
      <div className={cn('mb-4 flex items-center gap-2', collapsed ? 'justify-center' : 'px-3')}>
        <button
          type="button"
          onClick={onToggleCollapse}
          title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          className="shrink-0 rounded-md p-1 text-sidebar-muted transition-colors hover:bg-white/10 hover:text-white"
        >
          <Menu size={16} />
        </button>
        {!collapsed && (
          <h2 className="text-sm font-semibold uppercase tracking-widest text-sidebar-muted">
            Shipment Tracker
          </h2>
        )}
      </div>

      <Separator className="mb-4 bg-white/10" />

      <div className="flex flex-1 flex-col gap-1 overflow-y-auto">
        <NavLink
          href="/dashboard"
          icon={<LayoutDashboard size={16} />}
          label="Dashboard"
          onClick={onNavClick}
          collapsed={collapsed}
        />

        <div className="mt-4">
          {!collapsed ? (
            <p className="mb-1 px-3 text-[0.65rem] font-semibold uppercase tracking-widest text-sidebar-muted">
              Air Shipments
            </p>
          ) : (
            <Separator className="mb-2 bg-white/10" />
          )}
          <div className="flex flex-col gap-1">
            <NavLink
              href="/air-shipments"
              icon={<Plane size={16} />}
              label="Shipments"
              onClick={onNavClick}
              collapsed={collapsed}
            />
            <NavLink
              href="/pnl"
              icon={<TrendingUp size={16} />}
              label="P&L Analysis"
              onClick={onNavClick}
              collapsed={collapsed}
            />
            <NavLink
              href="/sla"
              icon={<ShieldAlert size={16} />}
              label="SLA Monitoring"
              onClick={onNavClick}
              collapsed={collapsed}
            />
            {hasPermission('read.google_sheet_config') && (
              <NavLink
                href="/air-shipments/google-sheet-config"
                icon={<ClipboardList size={16} />}
                label="Google Sheet Config"
                onClick={onNavClick}
                collapsed={collapsed}
              />
            )}
          </div>
        </div>

        {isAdminOrAbove && (
          <div className="mt-4">
            {!collapsed ? (
              <p className="mb-1 px-3 text-[0.65rem] font-semibold uppercase tracking-widest text-sidebar-muted">
                Settings
              </p>
            ) : (
              <Separator className="mb-2 bg-white/10" />
            )}
            <div className="flex flex-col gap-1">
              {isSuperAdmin && (
                <NavLink
                  href="/settings/organizations"
                  icon={<Building2 size={16} />}
                  label="Organizations"
                  onClick={onNavClick}
                  collapsed={collapsed}
                />
              )}
              <NavLink
                href="/settings/roles"
                icon={<Shield size={16} />}
                label="Roles"
                onClick={onNavClick}
                collapsed={collapsed}
              />
              <NavLink
                href="/settings/users"
                icon={<Users size={16} />}
                label="Users"
                onClick={onNavClick}
                collapsed={collapsed}
              />
              <NavLink
                href="/settings/invitations"
                icon={<Mail size={16} />}
                label="Invitations"
                onClick={onNavClick}
                collapsed={collapsed}
              />
              {isSuperAdmin && (
                <NavLink
                  href="/settings/permissions"
                  icon={<Key size={16} />}
                  label="Permissions"
                  onClick={onNavClick}
                  collapsed={collapsed}
                />
              )}
            </div>
          </div>
        )}

        {isSuperAdmin && (
          <div className="mt-4">
            {collapsed && <Separator className="mb-2 bg-white/10" />}
            <NavLink
              href="/audit"
              icon={<ClipboardList size={16} />}
              label="Audit Logs"
              onClick={onNavClick}
              collapsed={collapsed}
            />
          </div>
        )}
      </div>

      <Separator className="my-3 bg-white/10" />
      <div className={cn(collapsed ? 'flex justify-center' : 'px-3')}>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => logout()}
          title={collapsed ? 'Sign out' : undefined}
          className={cn(
            'text-sidebar-muted hover:bg-white/10 hover:text-white',
            collapsed ? 'w-9 justify-center px-0' : 'w-full justify-start gap-3'
          )}
        >
          <LogOut size={16} />
          {!collapsed && 'Sign out'}
        </Button>
      </div>
    </nav>
  )
}
