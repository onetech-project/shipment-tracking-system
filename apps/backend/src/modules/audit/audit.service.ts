import { Injectable } from '@nestjs/common'
import { OnEvent } from '@nestjs/event-emitter'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import { AuditLog } from './entities/audit-log.entity'

type AuditPayload = {
  organizationId?: string
  actorId?: string
  userId?: string
  roleId?: string
  invitationId?: string
  resourceId?: string
  ip?: string
  [key: string]: unknown
}

@Injectable()
export class AuditService {
  constructor(@InjectRepository(AuditLog) private readonly auditRepo: Repository<AuditLog>) {}

  private log(action: string, payload: AuditPayload, resourceType?: string) {
    const entry = this.auditRepo.create({
      action,
      actorId: payload.actorId ?? payload.userId,
      resourceType,
      resourceId: payload.resourceId ?? payload.userId ?? payload.roleId ?? payload.invitationId,
      ipAddress: payload.ip,
      metadata: payload,
    })
    // Fire-and-forget
    this.auditRepo.save(entry).catch(() => undefined)
  }

  @OnEvent('auth.login') onLogin(p: AuditPayload) {
    this.log('auth.login', p, 'user')
  }
  @OnEvent('auth.login_failed') onLoginFailed(p: AuditPayload) {
    this.log('auth.login_failed', p, 'user')
  }
  @OnEvent('auth.logout') onLogout(p: AuditPayload) {
    this.log('auth.logout', p, 'user')
  }
  @OnEvent('auth.logout_all') onLogoutAll(p: AuditPayload) {
    this.log('auth.logout_all', p, 'user')
  }

  @OnEvent('organization.created') onOrgCreated(p: AuditPayload) {
    this.log('organization.created', p, 'organization')
  }
  @OnEvent('organization.updated') onOrgUpdated(p: AuditPayload) {
    this.log('organization.updated', p, 'organization')
  }
  @OnEvent('organization.deactivated') onOrgDeactivated(p: AuditPayload) {
    this.log('organization.deactivated', p, 'organization')
  }

  @OnEvent('user.created') onUserCreated(p: AuditPayload) {
    this.log('user.created', p, 'user')
  }
  @OnEvent('user.updated') onUserUpdated(p: AuditPayload) {
    this.log('user.updated', p, 'user')
  }
  @OnEvent('user.deactivated') onUserDeactivated(p: AuditPayload) {
    this.log('user.deactivated', p, 'user')
  }
  @OnEvent('user.password_changed') onPasswordChanged(p: AuditPayload) {
    this.log('user.password_changed', p, 'user')
  }
  @OnEvent('user.password_reset') onPasswordReset(p: AuditPayload) {
    this.log('user.password_reset', p, 'user')
  }
  @OnEvent('user.unlocked') onUserUnlocked(p: AuditPayload) {
    this.log('user.unlocked', p, 'user')
  }

  @OnEvent('role.created') onRoleCreated(p: AuditPayload) {
    this.log('role.created', p, 'role')
  }
  @OnEvent('role.updated') onRoleUpdated(p: AuditPayload) {
    this.log('role.updated', p, 'role')
  }
  @OnEvent('role.deleted') onRoleDeleted(p: AuditPayload) {
    this.log('role.deleted', p, 'role')
  }
  @OnEvent('role.assigned') onRoleAssigned(p: AuditPayload) {
    this.log('role.assigned', p, 'role')
  }
  @OnEvent('role.revoked') onRoleRevoked(p: AuditPayload) {
    this.log('role.revoked', p, 'role')
  }
  @OnEvent('role.permissions_updated') onPermissionsUpdated(p: AuditPayload) {
    this.log('role.permissions_updated', p, 'role')
  }

  @OnEvent('invitation.created') onInvitationCreated(p: AuditPayload) {
    this.log('invitation.created', p, 'invitation')
  }
  @OnEvent('invitation.cancelled') onInvitationCancelled(p: AuditPayload) {
    this.log('invitation.cancelled', p, 'invitation')
  }

  @OnEvent('google_sheet_config.created')
  onGoogleSheetConfigCreated(p: AuditPayload) {
    this.log('create.google_sheet_config', p, 'google_sheet_config')
  }
  @OnEvent('google_sheet_config.updated')
  onGoogleSheetConfigUpdated(p: AuditPayload) {
    this.log('update.google_sheet_config', p, 'google_sheet_config')
  }
  @OnEvent('google_sheet_config.deleted')
  onGoogleSheetConfigDeleted(p: AuditPayload) {
    this.log('delete.google_sheet_config', p, 'google_sheet_config')
  }

  @OnEvent('shipment_row.lock_changed')
  onShipmentRowLockChanged(p: AuditPayload) {
    this.log('shipment_row.lock_changed', p, 'shipment_row')
  }
}
