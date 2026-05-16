describe('emailClient', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.resetModules();
    process.env = {
      ...originalEnv
    };
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  test('returns a fake success response when email sending is disabled', async () => {
    process.env.EMAIL_ENABLED = 'false';

    const { sendEmail } = require('../src/lib/emailClient');

    const result = await sendEmail({
      to: 'patient@example.com',
      subject: 'Test email',
      text: 'This is a local test email.'
    });

    expect(result).toMatchObject({
      provider: 'disabled',
      to: 'patient@example.com',
      subject: 'Test email'
    });
    expect(result.messageId).toEqual(expect.stringContaining('local-disabled-'));
  });

  test('sends through Resend with EMAIL_FROM_ADDRESS and EMAIL_REPLY_TO', async () => {
    const sendMock = jest.fn().mockResolvedValue({
      data: {
        id: 'resend-message-1'
      },
      error: null
    });
    const resendConstructor = jest.fn(() => ({
      emails: {
        send: sendMock
      }
    }));

    jest.doMock(
      'resend',
      () => ({
        Resend: resendConstructor
      }),
      { virtual: true }
    );

    process.env.EMAIL_ENABLED = 'true';
    process.env.RESEND_API_KEY = 're_test_key';
    process.env.EMAIL_FROM_ADDRESS = 'VitaQ <notify@vitaq.co.za>';
    process.env.EMAIL_REPLY_TO = 'support@vitaq.co.za';

    const { sendEmail } = require('../src/lib/emailClient');

    const result = await sendEmail({
      to: 'patient@example.com',
      subject: 'Appointment reminder',
      html: '<p>Your appointment is soon.</p>',
      text: 'Your appointment is soon.',
      idempotencyKey: 'appointment_reminder_30m:appointment-1'
    });

    expect(resendConstructor).toHaveBeenCalledWith('re_test_key');
    expect(sendMock).toHaveBeenCalledWith({
      from: 'VitaQ <notify@vitaq.co.za>',
      to: 'patient@example.com',
      subject: 'Appointment reminder',
      html: '<p>Your appointment is soon.</p>',
      text: 'Your appointment is soon.',
      replyTo: 'support@vitaq.co.za',
      headers: {
        'Idempotency-Key': 'appointment_reminder_30m:appointment-1'
      }
    });
    expect(result).toMatchObject({
      provider: 'resend',
      messageId: 'resend-message-1'
    });
  });

  test('keeps RESEND_FROM_EMAIL as a backward-compatible fallback', async () => {
    const sendMock = jest.fn().mockResolvedValue({
      data: {
        id: 'resend-message-2'
      },
      error: null
    });

    jest.doMock(
      'resend',
      () => ({
        Resend: jest.fn(() => ({
          emails: {
            send: sendMock
          }
        }))
      }),
      { virtual: true }
    );

    process.env.EMAIL_ENABLED = 'true';
    process.env.RESEND_API_KEY = 're_test_key';
    delete process.env.EMAIL_FROM_ADDRESS;
    process.env.RESEND_FROM_EMAIL = 'VitaQ <legacy@vitaq.co.za>';

    const { sendEmail } = require('../src/lib/emailClient');

    await sendEmail({
      to: 'patient@example.com',
      subject: 'Appointment reminder',
      text: 'Your appointment is soon.'
    });

    expect(sendMock).toHaveBeenCalledWith(
      expect.objectContaining({
        from: 'VitaQ <legacy@vitaq.co.za>'
      })
    );
  });
});
