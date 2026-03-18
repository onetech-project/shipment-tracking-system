import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { BullModule } from '@nestjs/bullmq'
import { MailerModule } from '@nestjs-modules/mailer'
import { ConfigService } from '@nestjs/config'
import { InvitationsService } from './invitations.service'
import { InvitationsController } from './invitations.controller'
import { Invitation } from './entities/invitation.entity'
import { EmailProcessor } from './email.processor'
import { User } from '../users/entities/user.entity'
import { Profile } from '../organizations/entities/profile.entity'
import { UserRole } from '../roles/entities/user-role.entity'

@Module({
  imports: [
    TypeOrmModule.forFeature([Invitation, User, Profile, UserRole]),
    BullModule.registerQueue({ name: 'email' }),
    MailerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const user = config.get<string>('SMTP_USER')
        const pass = config.get<string>('SMTP_PASS')
        return {
          transport: {
            host: config.get<string>('SMTP_HOST', 'localhost'),
            port: config.get<number>('SMTP_PORT', 587),
            ...(user && pass ? { auth: { user, pass } } : {}),
          },
          defaults: { from: config.get<string>('SMTP_FROM', 'noreply@example.com') },
        }
      },
    }),
  ],
  controllers: [InvitationsController],
  providers: [InvitationsService, EmailProcessor],
  exports: [InvitationsService],
})
export class InvitationsModule {}
