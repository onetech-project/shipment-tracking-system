import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { MailerService } from '@nestjs-modules/mailer';
import { Logger } from '@nestjs/common';

@Processor('email')
export class EmailProcessor extends WorkerHost {
  private readonly logger = new Logger(EmailProcessor.name);

  constructor(private readonly mailerService: MailerService) {
    super();
  }

  async process(job: Job): Promise<void> {
    const { name, data } = job;
    if (name === 'send-invitation') {
      try {
        await this.mailerService.sendMail({
          to: data.to,
          subject: 'You have been invited',
          text: `Accept your invitation: ${data.invitationUrl}`,
          html: `<p>Accept your invitation: <a href="${data.invitationUrl}">${data.invitationUrl}</a></p>`,
        });
      } catch (err) {
        this.logger.error(`Failed to send invitation email to ${data.to}`, err);
        throw err;
      }
    }
  }
}
