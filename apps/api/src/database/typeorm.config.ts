import { type ConfigService } from '@nestjs/config';
import { type TypeOrmModuleOptions } from '@nestjs/typeorm';
import { MANUAL_BUILDER_ENTITIES } from './entities';

export function createTypeOrmOptions(configService: ConfigService): TypeOrmModuleOptions {
  const databaseUrl = configService.get<string>('DATABASE_URL')?.trim();
  const synchronize = parseBoolean(configService.get<string>('DB_SYNCHRONIZE'), false);
  const logging = parseBoolean(configService.get<string>('DB_LOGGING'), false);
  const sslEnabled = parseBoolean(configService.get<string>('DB_SSL'), false);

  return {
    type: 'postgres',
    ...(databaseUrl
      ? {
          url: databaseUrl,
        }
      : {
          host: configService.get<string>('DB_HOST', '172.17.102.45'),
          port: parseInteger(configService.get<string>('DB_PORT'), 3311),
          username: configService.get<string>('DB_USERNAME', 'postgres'),
          password: configService.get<string>('DB_PASSWORD', '@@pruebasdb2024'),
          database: configService.get<string>('DB_DATABASE', 'manual_builder'),
        }),
    schema: configService.get<string>('DB_SCHEMA', 'public'),
    synchronize,
    logging,
    ssl: sslEnabled ? { rejectUnauthorized: false } : false,
    entities: [...MANUAL_BUILDER_ENTITIES],
  };
}

function parseBoolean(value: string | undefined, fallback: boolean): boolean {
  if (value === undefined) {
    return fallback;
  }

  return ['1', 'true', 'yes', 'on'].includes(value.trim().toLowerCase());
}

function parseInteger(value: string | undefined, fallback: number): number {
  if (value === undefined) {
    return fallback;
  }

  const parsedValue = Number.parseInt(value, 10);
  return Number.isFinite(parsedValue) ? parsedValue : fallback;
}
