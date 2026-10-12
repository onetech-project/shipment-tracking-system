'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useAuth } from '@/features/auth/auth.context'
import { usePermissions } from '@/shared/hooks/use-permissions'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { BrandLogo } from '@/components/shared/brand-logo'
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
  Package,
  Route,
  Truck,
  Container,
  Calculator,
} from 'lucide-react'

interface NavLinkProps {
  href: string
  icon: React.ReactNode
  label: string
  badge?: string
  onClick?: () => void
  collapsed?: boolean
}

function NavLink({ href, icon, label, badge, onClick, collapsed }: NavLinkProps) {
  const pathname = usePathname()
  const isActive = pathname === href || pathname?.startsWith(href + '/')
  return (
    <Link
      href={href}
      onClick={onClick}
      title={collapsed ? label : undefined}
      className={cn(
        'relative flex items-center rounded-[9px] py-[9px] text-[13px] font-medium motion-safe:transition-colors',
        collapsed ? 'justify-center px-2' : 'gap-2.5 px-2.5',
        isActive ? 'bg-brand/[.18] text-white' : 'text-sidebar-foreground hover:bg-white/5 hover:text-white'
      )}
    >
      {isActive && !collapsed && (
        <span aria-hidden="true" className="absolute -left-3.5 top-2.5 bottom-2.5 w-[3px] rounded-r-[3px] bg-brand" />
      )}
      <span className="inline-flex w-[18px] shrink-0 justify-center opacity-90">{icon}</span>
      {!collapsed && label}
      {badge && !collapsed && (
        <span className="ml-auto rounded-full bg-brand/[.18] px-1.5 py-0.5 text-[10px] font-semibold text-[#a6e5c0]">
          {badge}
        </span>
      )}
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
    <nav
      data-sidebar
      className="flex h-full w-full flex-col overflow-hidden border-r border-white/[.06] bg-sidebar px-3.5 py-[22px] text-sidebar-foreground"
    >
      <div className={cn('mb-4 flex items-center gap-2.5', collapsed ? 'flex-col' : 'px-1.5')}>
        <BrandLogo size={collapsed ? 'sm' : 'md'} />
        {!collapsed && (
          <div className="min-w-0 flex-1 leading-tight">
            <div className="text-[15px] font-bold tracking-[-0.01em] text-white">Shipment Tracker</div>
            <div className="text-[10px] font-medium uppercase tracking-[0.08em] text-[#88a088]">
              Eka Satya Puspita
            </div>
          </div>
        )}
        {onToggleCollapse && (
          <button
            type="button"
            onClick={onToggleCollapse}
            title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            className="shrink-0 rounded-md p-1 text-sidebar-muted transition-colors hover:bg-white/10 hover:text-white"
          >
            <Menu size={16} />
          </button>
        )}
      </div>

      <div className="flex flex-1 flex-col gap-1 overflow-y-auto">
        <NavLink
          href="/dashboard"
          icon={<LayoutDashboard size={16} />}
          label="Dashboard"
          onClick={onNavClick}
          collapsed={collapsed}
        />

        <div>
          {!collapsed ? (
            <p className="px-2.5 pb-1.5 pt-4 text-[10px] font-bold uppercase tracking-[0.1em] text-sidebar-muted">
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
            {hasPermission('read.pnl') && (
              <NavLink
                href="/pnl"
                icon={<TrendingUp size={16} />}
                label="P&L Analysis"
                onClick={onNavClick}
                collapsed={collapsed}
              />
            )}
            {hasPermission('read.sla') && (
              <NavLink
                href="/sla"
                icon={<ShieldAlert size={16} />}
                label="SLA Monitoring"
                badge="LIVE"
                onClick={onNavClick}
                collapsed={collapsed}
              />
            )}
            {hasPermission('read.google_sheet_config') && (
              <NavLink
                href="/air-shipments/google-sheet-config"
                icon={<ClipboardList size={16} />}
                label="Google Sheet Config"
                onClick={onNavClick}
                collapsed={collapsed}
              />
            )}
            {hasPermission('read.barhal') && (
              <NavLink
                href="/barhal"
                icon={<Package size={16} />}
                label="Barhal"
                onClick={onNavClick}
                collapsed={collapsed}
              />
            )}
            {hasPermission('read.route_group') && (
              <NavLink
                href="/route-groups"
                icon={<Route size={16} />}
                label="Route Group"
                onClick={onNavClick}
                collapsed={collapsed}
              />
            )}
            {hasPermission('read.vendor_group') && (
              <NavLink
                href="/vendor-groups"
                icon={<Truck size={16} />}
                label="Vendor Group"
                onClick={onNavClick}
                collapsed={collapsed}
              />
            )}
            {hasPermission('read.route_simulation') && (
              <NavLink
                href="/route-simulation"
                icon={<Calculator size={16} />}
                label="Simulasi Rute"
                onClick={onNavClick}
                collapsed={collapsed}
              />
            )}
            {hasPermission('read.fleet_vehicle') && (
              <NavLink
                href="/fleet"
                icon={<Container size={16} />}
                label="Registrasi Armada"
                onClick={onNavClick}
                collapsed={collapsed}
              />
            )}
          </div>
        </div>

        {isAdminOrAbove && (
          <div>
            {!collapsed ? (
              <p className="px-2.5 pb-1.5 pt-4 text-[10px] font-bold uppercase tracking-[0.1em] text-sidebar-muted">
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
            'text-sidebar-foreground hover:bg-white/5 hover:text-white',
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
