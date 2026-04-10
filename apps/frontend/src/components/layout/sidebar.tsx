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
  Upload,
  History,
  QrCode,
  Users,
  Shield,
  Building2,
  Mail,
  Key,
  ClipboardList,
  LogOut,
  Plane,
} from 'lucide-react'

interface NavLinkProps {
  href: string
  icon: React.ReactNode
  label: string
  onClick?: () => void
}

function NavLink({ href, icon, label, onClick }: NavLinkProps) {
  const pathname = usePathname()
  const isActive = pathname === href || pathname?.startsWith(href + '/')
  return (
    <Link
      href={href}
      onClick={onClick}
      className={cn(
        'flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium motion-safe:transition-colors',
        isActive
          ? 'bg-white/10 text-white'
          : 'text-sidebar-muted hover:bg-white/10 hover:text-white'
      )}
    >
      <span className="h-4 w-4 shrink-0">{icon}</span>
      {label}
    </Link>
  )
}

interface SidebarProps {
  onNavClick?: () => void
}

export function Sidebar({ onNavClick }: SidebarProps) {
  const { logout } = useAuth()
  const { isSuperAdmin, isAdminOrAbove, hasPermission } = usePermissions()

  return (
    <nav data-sidebar className="flex h-full w-60 flex-col bg-sidebar px-3 py-4">
      <div className="mb-6 px-3">
        <h2 className="text-sm font-semibold uppercase tracking-widest text-sidebar-muted">
          Shipment Tracker
        </h2>
      </div>
      <div className="flex flex-1 flex-col gap-1 overflow-y-auto">
        <NavLink
          href="/dashboard"
          icon={<LayoutDashboard size={16} />}
          label="Dashboard"
          onClick={onNavClick}
        />
        <div className="mt-4">
          <p className="mb-1 px-3 text-[0.65rem] font-semibold uppercase tracking-widest text-sidebar-muted">
            Air Shipments
          </p>
          <div className="flex flex-col gap-1">
            <NavLink
              href="/air-shipments/cgk"
              icon={<Plane size={16} />}
              label="Shipments"
              onClick={onNavClick}
            />
            {hasPermission('read.google_sheet_config') && (
              <NavLink
                href="/air-shipments/google-sheet-config"
                icon={<ClipboardList size={16} />}
                label="Google Sheet Config"
                onClick={onNavClick}
              />
            )}
          </div>
        </div>
        <div className="mt-4">
          <p className="mb-1 px-3 text-[0.65rem] font-semibold uppercase tracking-widest text-sidebar-muted">
            Shipments
          </p>
          <div className="flex flex-col gap-1">
            <NavLink
              href="/shipments/upload"
              icon={<Upload size={16} />}
              label="Import PDF"
              onClick={onNavClick}
            />
            <NavLink
              href="/shipments/history"
              icon={<History size={16} />}
              label="Upload History"
              onClick={onNavClick}
            />
            <NavLink
              href="/shipments/scan"
              icon={<QrCode size={16} />}
              label="QR Scan"
              onClick={onNavClick}
            />
          </div>
        </div>
        {isAdminOrAbove && (
          <div className="mt-4">
            <p className="mb-1 px-3 text-[0.65rem] font-semibold uppercase tracking-widest text-sidebar-muted">
              Settings
            </p>
            <div className="flex flex-col gap-1">
              {isSuperAdmin && (
                <NavLink
                  href="/settings/organizations"
                  icon={<Building2 size={16} />}
                  label="Organizations"
                  onClick={onNavClick}
                />
              )}
              <NavLink
                href="/settings/roles"
                icon={<Shield size={16} />}
                label="Roles"
                onClick={onNavClick}
              />
              <NavLink
                href="/settings/users"
                icon={<Users size={16} />}
                label="Users"
                onClick={onNavClick}
              />
              <NavLink
                href="/settings/invitations"
                icon={<Mail size={16} />}
                label="Invitations"
                onClick={onNavClick}
              />
              {isSuperAdmin && (
                <NavLink
                  href="/settings/permissions"
                  icon={<Key size={16} />}
                  label="Permissions"
                  onClick={onNavClick}
                />
              )}
            </div>
          </div>
        )}
        {isSuperAdmin && (
          <div className="mt-4">
            <NavLink
              href="/audit"
              icon={<ClipboardList size={16} />}
              label="Audit Logs"
              onClick={onNavClick}
            />
          </div>
        )}
      </div>
      <Separator className="my-3 bg-white/10" />
      <div className="px-3">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => logout()}
          className="w-full justify-start gap-3 text-sidebar-muted hover:bg-white/10 hover:text-white"
        >
          <LogOut size={16} />
          Sign out
        </Button>
      </div>
    </nav>
  )
}
