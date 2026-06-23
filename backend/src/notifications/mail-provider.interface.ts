export const MAIL_PROVIDER = Symbol("MAIL_PROVIDER");

export type MailSendResult = {
  messageId?: string;
  accepted?: string[];
  rejected?: string[];
};

export type SendMailInput = {
  to: string;
  subject: string;
  html: string;
  text: string;
};

export interface MailProvider {
  send(input: SendMailInput): Promise<MailSendResult>;
}
