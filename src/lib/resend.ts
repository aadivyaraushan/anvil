import { Resend } from "resend";

export type SendEmailParams = {
  to: string;
  from: string;
  subject: string;
  text: string;
};

export async function sendEmail(params: SendEmailParams): Promise<string> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) throw new Error("RESEND_API_KEY is not set");

  const resend = new Resend(apiKey);

  const { data, error } = await resend.emails.send({
    from: params.from,
    to: params.to,
    subject: params.subject,
    text: params.text,
  });

  if (error) throw new Error(`Resend error: ${error.message}`);
  if (!data?.id) throw new Error("Resend returned no message ID");

  return data.id;
}
