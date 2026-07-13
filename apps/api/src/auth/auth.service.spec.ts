import { ConfigService } from '@nestjs/config';
import { ManualBuilderRepository } from '../data/manual-builder.repository';
import { type UserRecord, type UserWithPasswordRecord } from '../domain/manual-builder.types';
import { AuthService } from './auth.service';

describe('AuthService', () => {
  it('registra y autentica una contrasena formada solo por numeros', async () => {
    const user: UserRecord = {
      id: '8db811f4-ce02-460a-ab63-3174781ab4a0',
      username: 'usuario123',
      displayName: 'Usuario 123',
      email: null,
      status: 'active',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    let storedUser: UserWithPasswordRecord | null = null;
    const repository = {
      findUserByUsername: jest.fn(async () => storedUser),
      createUser: jest.fn(async (input: { passwordHash: string }) => {
        storedUser = { ...user, passwordHash: input.passwordHash };
        return user;
      }),
    } as unknown as ManualBuilderRepository;
    const configService = new ConfigService({
      AUTH_TOKEN_SECRET: 'test-secret',
      AUTH_TOKEN_TTL_SECONDS: '3600',
    });
    const service = new AuthService(repository, configService);

    await service.register({
      username: user.username,
      password: '73910482',
      displayName: user.displayName,
    });
    const response = await service.login({
      username: user.username,
      password: '73910482',
    });

    expect(response.user.username).toBe(user.username);
    expect(response.accessToken.split('.')).toHaveLength(3);
  });
});
