import { Module } from '@nestjs/common'
import { ConfigModule, ConfigService } from '@nestjs/config'
import { TypeOrmModule } from '@nestjs/typeorm'
import { EventEmitterModule } from '@nestjs/event-emitter'
import { ClsModule } from 'nestjs-cls'
import { BullModule } from '@nestjs/bullmq'
import { ThrottlerModule } from '@nestjs/throttler'
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core'
import * as Joi from 'joi'
import { HttpExceptionFilter } from './common/filters/http-exception.filter'
import { JwtAuthGuard } from './common/guards/jwt-auth.guard'
import { TenantClsInterceptor } from './common/interceptors/tenant-cls.interceptor'
import { AppController } from './app.controller'
import { AuthModule } from './modules/auth/auth.module'
import { OrganizationsModule } from './modules/organizations/organizations.module'
import { UsersModule } from './modules/users/users.module'
import { RolesModule } from './modules/roles/roles.module'
import { PermissionsModule } from './modules/permissions/permissions.module'
import { InvitationsModule } from './modules/invitations/invitations.module'
import { AuditModule } from './modules/audit/audit.module'
import { ShipmentsModule } from './modules/shipments/shipments.module'
import { AirShipmentsModule } from './modules/air-shipments/air-shipments.module'

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validationSchema: Joi.object({
        DATABASE_URL: Joi.string().required(),
        JWT_ACCESS_SECRET: Joi.string().required(),
        JWT_REFRESH_SECRET: Joi.string().required(),
        JWT_ACCESS_EXPIRES_IN: Joi.string().default('15m'),
        JWT_REFRESH_EXPIRES_IN: Joi.string().default('7d'),
        LOGIN_MAX_ATTEMPTS: Joi.number().default(5),
        SESSION_INACTIVITY_MINUTES: Joi.number().default(30),
        INVITATION_EXPIRY_HOURS: Joi.number().default(72),
        REDIS_HOST: Joi.string().default('redis'),
        REDIS_PORT: Joi.number().default(6379),
        APP_URL: Joi.string().default('http://localhost:3000'),
        BACKEND_PORT: Joi.number().default(4000),
        NODE_ENV: Joi.string().default('development'),
        SHIPMENT_IMPORT_MAX_FILE_MB: Joi.number().default(10),
        SHIPMENT_IMPORT_CONCURRENCY: Joi.number().default(3),
        SHIPMENT_ID_REGEX: Joi.string().default('^[A-Z0-9-]{6,40}$'),
        // Air Shipments / Google Sheets sync
        GOOGLE_CREDENTIALS_PATH: Joi.string().required(),
        // GOOGLE_SHEET_ID: Joi.string().required(),
        // SHEET_CONFIG_PATH: Joi.string().required(),
        // SYNC_INTERVAL_MS: Joi.number().default(15000),
        WEBSOCKET_CORS_ORIGIN: Joi.string().default('http://localhost:3000'),
      }),
    }),
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        type: 'postgres',
        url: config.getOrThrow<string>('DATABASE_URL'),
        autoLoadEntities: true,
        synchronize: false,
      }),
    }),
    EventEmitterModule.forRoot(),
    ClsModule.forRoot({ global: true, middleware: { mount: true } }),
    BullModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        connection: {
          host: config.get<string>('REDIS_HOST', 'redis'),
          port: config.get<number>('REDIS_PORT', 6379),
        },
      }),
    }),
    ThrottlerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: () => ({ throttlers: [{ ttl: 60000, limit: 100 }] }),
    }),
    AuthModule,
    OrganizationsModule,
    UsersModule,
    RolesModule,
    PermissionsModule,
    InvitationsModule,
    AuditModule,
    ShipmentsModule,
    AirShipmentsModule,
  ],
  controllers: [AppController],
  providers: [
    { provide: APP_FILTER, useClass: HttpExceptionFilter },
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_INTERCEPTOR, useClass: TenantClsInterceptor },
  ],
})
export class AppModule {}
