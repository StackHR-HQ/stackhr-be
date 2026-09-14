import { ValidationPipe } from '@nestjs/common';
import { AcceptInvitationDto } from './accept-invitation.dto';

describe('AcceptInvitationDto validation', () => {
  const pipe = new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
  });
  const validate = (body: unknown) =>
    pipe.transform(body, { type: 'body', metatype: AcceptInvitationDto });

  it('accepts an invitation token and a password of at least 12 characters', async () => {
    await expect(
      validate({
        token: 'raw-invitation-token',
        password: 'correct horse battery staple',
      }),
    ).resolves.toMatchObject({ token: 'raw-invitation-token' });
  });

  it.each([
    ['a missing token', { password: 'correct horse battery staple' }],
    [
      'a password under 12 characters',
      { token: 'token', password: 'short-pass1' },
    ],
    [
      'an email field, since the invitation decides the email',
      {
        token: 'token',
        password: 'correct horse battery staple',
        email: 'attacker@example.com',
      },
    ],
  ])('rejects %s', async (_label, body) => {
    await expect(validate(body)).rejects.toMatchObject({ status: 400 });
  });
});
