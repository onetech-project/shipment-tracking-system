// ── JWT Payload ───────────────────────────────────────────────────────────────
export interface JwtPayload {
  /** User UUID */
  sub: string;
  /** Organization UUID (null for super_admin) */
  org_id: string | null;
  /** Platform-wide super admin bypass flag */
  is_super_admin: boolean;
  /** Token issued-at (seconds) */
  iat?: number;
  /** Token expiration (seconds) */
  exp?: number;
}

// ── Permission Keys ───────────────────────────────────────────────────────────
export enum Permission {
  // Shipment
  READ_SHIPMENT = 'read.shipment',
  CREATE_SHIPMENT = 'create.shipment',
  UPDATE_SHIPMENT = 'update.shipment',
  DELETE_SHIPMENT = 'delete.shipment',

  // User
  READ_USER = 'read.user',
  CREATE_USER = 'create.user',
  UPDATE_USER = 'update.user',
  DELETE_USER = 'delete.user',

  // Role
  READ_ROLE = 'read.role',
  CREATE_ROLE = 'create.role',
  UPDATE_ROLE = 'update.role',
  DELETE_ROLE = 'delete.role',

  // Permission
  READ_PERMISSION = 'read.permission',
  CREATE_PERMISSION = 'create.permission',
  UPDATE_PERMISSION = 'update.permission',
  DELETE_PERMISSION = 'delete.permission',

  // Organization
  READ_ORGANIZATION = 'read.organization',
  CREATE_ORGANIZATION = 'create.organization',
  UPDATE_ORGANIZATION = 'update.organization',
  DELETE_ORGANIZATION = 'delete.organization',

  // Invitation
  READ_INVITATION = 'read.invitation',
  CREATE_INVITATION = 'create.invitation',
  UPDATE_INVITATION = 'update.invitation',
  DELETE_INVITATION = 'delete.invitation',

  // Audit
  READ_AUDIT = 'read.audit',
}

// ── Auth Response DTOs ────────────────────────────────────────────────────────
export interface AuthUserDto {
  id: string;
  username: string;
  organizationId: string | null;
  isSuperAdmin: boolean;
  roles: string[];
}

export interface LoginResponseDto {
  accessToken: string;
  user: AuthUserDto;
}

export interface RefreshResponseDto {
  accessToken: string;
}

// ── Profile ───────────────────────────────────────────────────────────────────
export interface ProfileDto {
  id: string;
  name: string;
  position: string | null;
  employeeNumber: string | null;
  email: string | null;
  phoneNumber: string | null;
}

export interface MeResponseDto extends AuthUserDto {
  profile: ProfileDto | null;
}
