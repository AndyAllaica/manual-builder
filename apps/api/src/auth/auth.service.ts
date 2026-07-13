import { ConflictException, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac, randomBytes, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import { ManualBuilderRepository } from '../data/manual-builder.repository';
import { type UserRecord, type UserWithPasswordRecord } from '../domain/manual-builder.types';
import { type LoginDto } from './dto/login.dto';
import { type RegisterDto } from './dto/register.dto';
import { type AuthenticatedUser } from './auth.types';

interface AccessTokenPayload {
  sub: string;
  username: string;
  displayName: string;
  email: string | null;
  iat: number;
  exp: number;
}

export interface AuthResponse {
  user: AuthenticatedUser;
  accessToken: string;
  tokenType: 'Bearer';
  expiresIn: number;
}

const scrypt = promisify(scryptCallback);
const PASSWORD_HASH_PREFIX = 'scrypt';
const PASSWORD_KEY_LENGTH = 64;

@Injectable()
export class AuthService {
  constructor(
    private readonly repository: ManualBuilderRepository,
    private readonly configService: ConfigService,
  ) {}

  async register(input: RegisterDto): Promise<AuthResponse> {
    const existingUser = await this.repository.findUserByUsername(input.username);
    if (existingUser !== null) {
      throw new ConflictException('Ya existe un usuario con ese nombre.');
    }

    const passwordHash = await hashPassword(input.password);
    const user = await this.repository.createUser({
      username: input.username,
      displayName: input.displayName,
      email: input.email,
      passwordHash,
    });

    return this.buildAuthResponse(user);
  }

  async login(input: LoginDto): Promise<AuthResponse> {
    const user = await this.repository.findUserByUsername(input.username);
    if (user === null || user.status !== 'active') {
      throw new UnauthorizedException('Usuario o contrasena incorrectos.');
    }

    const passwordMatches = await verifyPassword(input.password, user.passwordHash);
    if (!passwordMatches) {
      throw new UnauthorizedException('Usuario o contrasena incorrectos.');
    }

    return this.buildAuthResponse(user);
  }

  async authenticateAuthorizationHeader(authorizationHeader: string): Promise<AuthenticatedUser> {
    const [scheme, token] = authorizationHeader.split(' ');
    if (scheme?.toLowerCase() !== 'bearer' || token === undefined || token.trim().length === 0) {
      throw new UnauthorizedException('Token Bearer invalido.');
    }

    const payload = this.verifyAccessToken(token);
    const user = await this.repository.findUserById(payload.sub);
    if (user === null || user.status !== 'active') {
      throw new UnauthorizedException('Usuario no autorizado.');
    }

    return toAuthenticatedUser(user);
  }

  private buildAuthResponse(user: UserRecord): AuthResponse {
    const expiresIn = parseInteger(this.configService.get<string>('AUTH_TOKEN_TTL_SECONDS'), 8 * 60 * 60);

    return {
      user: toAuthenticatedUser(user),
      accessToken: this.createAccessToken(user, expiresIn),
      tokenType: 'Bearer',
      expiresIn,
    };
  }

  private createAccessToken(user: UserRecord, expiresInSeconds: number): string {
    const now = Math.floor(Date.now() / 1000);
    const header = base64UrlEncode(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
    const payload = base64UrlEncode(JSON.stringify({
      sub: user.id,
      username: user.username,
      displayName: user.displayName,
      email: user.email,
      iat: now,
      exp: now + expiresInSeconds,
    } satisfies AccessTokenPayload));
    const signature = signToken(`${header}.${payload}`, this.getTokenSecret());

    return `${header}.${payload}.${signature}`;
  }

  private verifyAccessToken(token: string): AccessTokenPayload {
    const parts = token.split('.');
    if (parts.length !== 3) {
      throw new UnauthorizedException('Token invalido.');
    }

    const [header, payload, signature] = parts;
    if (header === undefined || payload === undefined || signature === undefined) {
      throw new UnauthorizedException('Token invalido.');
    }

    const expectedSignature = signToken(`${header}.${payload}`, this.getTokenSecret());
    if (!safeEqual(signature, expectedSignature)) {
      throw new UnauthorizedException('Token invalido.');
    }

    const parsedPayload = parseAccessTokenPayload(payload);
    if (parsedPayload.exp < Math.floor(Date.now() / 1000)) {
      throw new UnauthorizedException('La sesion expiro. Inicia sesion nuevamente.');
    }

    return parsedPayload;
  }

  private getTokenSecret(): string {
    return this.configService.get<string>('AUTH_TOKEN_SECRET')?.trim()
      || 'manual-builder-dev-secret-change-me';
  }
}

async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16).toString('hex');
  const derivedKey = await scrypt(password, salt, PASSWORD_KEY_LENGTH) as Buffer;
  return `${PASSWORD_HASH_PREFIX}:${salt}:${derivedKey.toString('hex')}`;
}

async function verifyPassword(password: string, passwordHash: string): Promise<boolean> {
  const [prefix, salt, storedKey] = passwordHash.split(':');
  if (prefix !== PASSWORD_HASH_PREFIX || salt === undefined || storedKey === undefined) {
    return false;
  }

  const derivedKey = await scrypt(password, salt, PASSWORD_KEY_LENGTH) as Buffer;
  return safeEqual(derivedKey.toString('hex'), storedKey);
}

function toAuthenticatedUser(user: UserRecord | UserWithPasswordRecord): AuthenticatedUser {
  return {
    id: user.id,
    username: user.username,
    displayName: user.displayName,
    email: user.email,
  };
}

function signToken(value: string, secret: string): string {
  return createHmac('sha256', secret).update(value).digest('base64url');
}

function base64UrlEncode(value: string): string {
  return Buffer.from(value, 'utf8').toString('base64url');
}

function safeEqual(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);

  if (leftBuffer.length !== rightBuffer.length) {
    return false;
  }

  return timingSafeEqual(leftBuffer, rightBuffer);
}

function parseAccessTokenPayload(encodedPayload: string): AccessTokenPayload {
  let rawPayload: unknown;

  try {
    rawPayload = JSON.parse(Buffer.from(encodedPayload, 'base64url').toString('utf8')) as unknown;
  } catch {
    throw new UnauthorizedException('Token invalido.');
  }

  if (!isAccessTokenPayload(rawPayload)) {
    throw new UnauthorizedException('Token invalido.');
  }

  return rawPayload;
}

function isAccessTokenPayload(value: unknown): value is AccessTokenPayload {
  if (typeof value !== 'object' || value === null) {
    return false;
  }

  const payload = value as Partial<AccessTokenPayload>;
  return (
    typeof payload.sub === 'string' &&
    typeof payload.username === 'string' &&
    typeof payload.displayName === 'string' &&
    (typeof payload.email === 'string' || payload.email === null) &&
    typeof payload.iat === 'number' &&
    typeof payload.exp === 'number'
  );
}

function parseInteger(value: string | undefined, fallback: number): number {
  if (value === undefined) {
    return fallback;
  }

  const parsedValue = Number.parseInt(value, 10);
  return Number.isFinite(parsedValue) && parsedValue > 0 ? parsedValue : fallback;
}
