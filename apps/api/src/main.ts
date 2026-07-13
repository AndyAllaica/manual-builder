import { NestFactory } from '@nestjs/core';
import { ValidationPipe, VersioningType } from '@nestjs/common';
import { mkdir } from 'node:fs/promises';
import { AppModule } from './app.module';
import { ConfigService } from '@nestjs/config';
import express from 'express';
import { resolve } from 'node:path';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { bodyParser: false });
  const configService = app.get(ConfigService);
  const port = configService.get<string>('PORT', '3001');
  const maxJsonBodySize = configService.get<string>('MAX_JSON_BODY_SIZE', '40mb');
  const storageRoot = resolve(__dirname, '..', configService.get<string>('STORAGE_ROOT', 'storage'));

  await mkdir(storageRoot, { recursive: true });

  app.use(express.json({ limit: maxJsonBodySize }));
  app.use(express.urlencoded({ limit: maxJsonBodySize, extended: true }));
  app.setGlobalPrefix('api');
  app.enableVersioning({
    type: VersioningType.URI,
    defaultVersion: '1',
  });
  app.useGlobalPipes(new ValidationPipe({
    transform: true,
    whitelist: true,
    forbidNonWhitelisted: true,
  }));
  app.enableCors({
    origin: true,
  });
  app.use('/uploads', express.static(storageRoot));

  await app.listen(port);
}
bootstrap();
