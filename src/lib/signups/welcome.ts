/**
 * The "You're on the list" email, sent through Resend to each NEW sign-up.
 *
 * Never sent for repeat sign-ups, flagged (likely spam) sign-ups or reserved test
 * addresses. A failure is logged and never affects the visitor's sign-up.
 * Until seaairclub.co.uk is verified in Resend, Resend refuses the send and we log a warning.
 */
import type { EmailSender } from '@/lib/email/resend';
import { welcomeEmail } from '@/lib/email/templates';
import { isTestEmail } from './export';
import { describeError, maskEmail } from './log';
import type { Logger, SignupRecord } from './types';

export interface WelcomeSettings {
  /** e.g. `Sea Air Club <hello@seaairclub.co.uk>`. Unset disables the email. */
  from: string | undefined;
  replyTo: string | undefined;
  siteUrl: string;
}

export type WelcomeHook = (record: SignupRecord, created: boolean) => Promise<void>;

export function createWelcomeHook(
  sender: EmailSender | null,
  settings: WelcomeSettings,
  logger: Logger,
): WelcomeHook {
  return async (record, created) => {
    if (!sender || !settings.from) return;
    if (!created || record.flagged || isTestEmail(record.email)) return;
    try {
      const email = welcomeEmail({
        firstName: record.firstName,
        siteUrl: settings.siteUrl,
        replyTo: settings.replyTo,
      });
      await sender.send({
        from: settings.from,
        to: record.email,
        replyTo: settings.replyTo,
        ...email,
      });
      logger.info('Welcome email sent', { email: maskEmail(record.email) });
    } catch (error) {
      logger.warn('Welcome email not sent', {
        email: maskEmail(record.email),
        error: describeError(error),
      });
    }
  };
}
