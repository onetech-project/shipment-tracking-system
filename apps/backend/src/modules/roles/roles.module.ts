import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { RolesService } from './roles.service';
import { RolesController } from './roles.controller';
import { Role } from './entities/role.entity';
import { UserRole } from './entities/user-role.entity';
import { PermissionEntity } from '../permissions/entities/permission.entity';
import { RolePermission } from '../permissions/entities/role-permission.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Role, UserRole, PermissionEntity, RolePermission])],
  controllers: [RolesController],
  providers: [RolesService],
  exports: [RolesService, TypeOrmModule],
})
export class RolesModule {}
