import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { AuditService } from './audit.service';
import { AuditLog } from './entities/audit-log.entity';

describe('AuditService', () => {
  let service: AuditService;

  const auditRepo = {
    create: jest.fn((dto) => ({ ...dto })),
    save: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuditService,
        { provide: getRepositoryToken(AuditLog), useValue: auditRepo },
      ],
    }).compile();

    service = module.get<AuditService>(AuditService);
    jest.clearAllMocks();
    auditRepo.create.mockImplementation((dto) => ({ ...dto }));
    auditRepo.save.mockResolvedValue({});
  });

  // ─── auth events ─────────────────────────────────────────────────────────

  describe('auth event handlers', () => {
    it('onLogin saves entry with action=auth.login and resourceType=user', async () => {
      service.onLogin({ organizationId: 'org-1', userId: 'user-1', ip: '1.2.3.4' });
      await new Promise(setImmediate);

      expect(auditRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'auth.login', resourceType: 'user' }),
      );
      expect(auditRepo.save).toHaveBeenCalled();
    });

    it('onLoginFailed saves entry with action=auth.login_failed', async () => {
      service.onLoginFailed({ userId: 'user-1' });
      await new Promise(setImmediate);

      expect(auditRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'auth.login_failed', resourceType: 'user' }),
      );
    });

    it('onLogout saves entry with action=auth.logout', async () => {
      service.onLogout({ userId: 'user-1', actorId: 'user-1' });
      await new Promise(setImmediate);

      expect(auditRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'auth.logout', resourceType: 'user' }),
      );
    });

    it('onLogoutAll saves entry with action=auth.logout_all', async () => {
      service.onLogoutAll({ userId: 'user-1' });
      await new Promise(setImmediate);

      expect(auditRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'auth.logout_all', resourceType: 'user' }),
      );
    });
  });

  // ─── organization events ─────────────────────────────────────────────────

  describe('organization event handlers', () => {
    it('onOrgCreated saves entry with action=organization.created and resourceType=organization', async () => {
      service.onOrgCreated({ organizationId: 'org-1', actorId: 'actor-1', resourceId: 'org-1' });
      await new Promise(setImmediate);

      expect(auditRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'organization.created', resourceType: 'organization' }),
      );
    });

    it('onOrgUpdated saves entry with action=organization.updated', async () => {
      service.onOrgUpdated({ organizationId: 'org-1', actorId: 'actor-1' });
      await new Promise(setImmediate);

      expect(auditRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'organization.updated', resourceType: 'organization' }),
      );
    });

    it('onOrgDeactivated saves entry with action=organization.deactivated', async () => {
      service.onOrgDeactivated({ organizationId: 'org-1', actorId: 'actor-1' });
      await new Promise(setImmediate);

      expect(auditRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'organization.deactivated', resourceType: 'organization' }),
      );
    });
  });

  // ─── user events ─────────────────────────────────────────────────────────

  describe('user event handlers', () => {
    it('onUserCreated saves entry with action=user.created', async () => {
      service.onUserCreated({ userId: 'user-1', organizationId: 'org-1' });
      await new Promise(setImmediate);

      expect(auditRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'user.created', resourceType: 'user' }),
      );
    });

    it('onUserDeactivated saves entry with action=user.deactivated', async () => {
      service.onUserDeactivated({ userId: 'user-1' });
      await new Promise(setImmediate);

      expect(auditRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'user.deactivated', resourceType: 'user' }),
      );
    });

    it('onPasswordChanged saves entry with action=user.password_changed', async () => {
      service.onPasswordChanged({ userId: 'user-1', actorId: 'user-1' });
      await new Promise(setImmediate);

      expect(auditRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'user.password_changed', resourceType: 'user' }),
      );
    });

    it('onUserUnlocked saves entry with action=user.unlocked', async () => {
      service.onUserUnlocked({ userId: 'user-1', actorId: 'actor-1' });
      await new Promise(setImmediate);

      expect(auditRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'user.unlocked', resourceType: 'user' }),
      );
    });
  });

  // ─── role events ─────────────────────────────────────────────────────────

  describe('role event handlers', () => {
    it('onRoleCreated saves entry with action=role.created and resourceType=role', async () => {
      service.onRoleCreated({ roleId: 'role-1', organizationId: 'org-1', actorId: 'actor-1' });
      await new Promise(setImmediate);

      expect(auditRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'role.created', resourceType: 'role' }),
      );
    });

    it('onRoleAssigned saves entry with action=role.assigned', async () => {
      service.onRoleAssigned({ roleId: 'role-1', userId: 'user-1' });
      await new Promise(setImmediate);

      expect(auditRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'role.assigned', resourceType: 'role' }),
      );
    });

    it('onRoleRevoked saves entry with action=role.revoked', async () => {
      service.onRoleRevoked({ roleId: 'role-1', userId: 'user-1' });
      await new Promise(setImmediate);

      expect(auditRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'role.revoked', resourceType: 'role' }),
      );
    });

    it('onPermissionsUpdated saves entry with action=role.permissions_updated', async () => {
      service.onPermissionsUpdated({ roleId: 'role-1', actorId: 'actor-1' });
      await new Promise(setImmediate);

      expect(auditRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'role.permissions_updated', resourceType: 'role' }),
      );
    });
  });

  // ─── invitation events ───────────────────────────────────────────────────

  describe('invitation event handlers', () => {
    it('onInvitationCreated saves entry with action=invitation.created and resourceType=invitation', async () => {
      service.onInvitationCreated({ invitationId: 'inv-1', organizationId: 'org-1' });
      await new Promise(setImmediate);

      expect(auditRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'invitation.created', resourceType: 'invitation' }),
      );
    });

    it('onInvitationCancelled saves entry with action=invitation.cancelled', async () => {
      service.onInvitationCancelled({ invitationId: 'inv-1', actorId: 'actor-1' });
      await new Promise(setImmediate);

      expect(auditRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'invitation.cancelled', resourceType: 'invitation' }),
      );
    });
  });

  // ─── fire-and-forget error handling ──────────────────────────────────────

  describe('fire-and-forget behaviour', () => {
    it('swallows save errors and does not propagate', async () => {
      auditRepo.save.mockRejectedValue(new Error('DB error'));

      expect(() => service.onLogin({ userId: 'user-1' })).not.toThrow();
      // Wait for promise rejection to be handled
      await new Promise(setImmediate);
      // No unhandled rejection should be thrown
    });
  });
});
