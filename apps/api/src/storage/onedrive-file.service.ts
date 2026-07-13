import { BadGatewayException, Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios, { type AxiosRequestConfig, type AxiosResponse } from 'axios';
import FormData from 'form-data';
import { constants } from 'node:crypto';
import { Agent } from 'node:https';

interface OneDriveFileUploadInput {
  buffer: Buffer;
  mimeType: string;
  fileName: string;
  storagePath: string;
}

interface OneDriveFileMetadata {
  storagePath: string;
  publicUrl: string | null;
  fileName: string | null;
}

interface TokenCache {
  token: string;
  expiresAt: number;
}

@Injectable()
export class OneDriveFileService {
  private readonly logger = new Logger(OneDriveFileService.name);
  private readonly defaultTokenTtlMs = 1000 * 60 * 60 * 6;
  private readonly httpsAgent = new Agent({
    rejectUnauthorized: false,
    secureOptions: constants.SSL_OP_LEGACY_SERVER_CONNECT,
  });
  private tokenCache: TokenCache | null = null;

  constructor(private readonly configService: ConfigService) {}

  async uploadFile(input: OneDriveFileUploadInput): Promise<OneDriveFileMetadata> {
    const endpoint = this.requireEndpoint('SUBIR_ARCHIVO', 'subida de archivo');
    const token = await this.getValidToken();
    const formData = new FormData();
    const directoryPath = getDirectoryPath(input.storagePath);

    formData.append('ruta', directoryPath);
    formData.append('rutaDestino', directoryPath);
    formData.append('path', directoryPath);
    formData.append('crearRuta', 'true');
    formData.append('nombreDestino', input.fileName);
    formData.append('nombreArchivo', input.fileName);
    formData.append('filename', input.fileName);
    formData.append('file', input.buffer, {
      filename: input.fileName,
      contentType: input.mimeType,
    });

    this.logger.log(`Subiendo asset a OneDrive: ruta=${directoryPath}, archivo=${input.fileName}`);
    const payload = await this.requestJson(endpoint, {
      method: 'POST',
      headers: this.buildHeaders(token, formData.getHeaders() as Record<string, string>),
      data: formData,
    });
    assertOperationSucceeded(payload, 'subir el archivo');
    const metadata = this.extractFileMetadata(payload);
    this.logger.log(`Asset almacenado en OneDrive: ${metadata.storagePath ?? input.storagePath}`);

    return {
      storagePath: metadata.storagePath ?? input.storagePath,
      publicUrl: metadata.publicUrl,
      fileName: metadata.fileName ?? input.fileName,
    };
  }

  async deleteFile(storagePath: string): Promise<void> {
    const endpoint = this.getOptionalEndpoint('ELIMINAR_ARCHIVO');
    if (endpoint === null) {
      return;
    }

    await this.postJson(endpoint, {
      ruta: storagePath,
      rutaDestino: storagePath,
      path: storagePath,
    });
  }

  async resolveFileMetadata(storagePath: string): Promise<OneDriveFileMetadata> {
    const normalizedStoragePath = normalizeStoragePath(storagePath);
    const attempts: Array<() => Promise<unknown>> = [];
    const obtenerArchivoEndpoint = this.getOptionalEndpoint('OBTENER_ARCHIVO');
    const obtenerListaEndpoint = this.getOptionalEndpoint('OBTENER_LIST_ARCHIVO');

    if (obtenerArchivoEndpoint !== null) {
      attempts.push(() => this.postJson(obtenerArchivoEndpoint, {
        ruta: normalizedStoragePath,
        path: normalizedStoragePath,
      }));
    }

    if (obtenerListaEndpoint !== null) {
      attempts.push(() => this.postJson(obtenerListaEndpoint, {
        rutas: [normalizedStoragePath],
      }));
    }

    for (const attempt of attempts) {
      try {
        const metadata = this.extractFileMetadata(await attempt());
        if (metadata.publicUrl !== null || metadata.storagePath !== null || metadata.fileName !== null) {
          return {
            storagePath: metadata.storagePath ?? normalizedStoragePath,
            publicUrl: metadata.publicUrl,
            fileName: metadata.fileName,
          };
        }
      } catch (error) {
        this.logger.warn(`No se pudo resolver metadata de OneDrive por ruta: ${getErrorMessage(error)}`);
      }
    }

    return {
      storagePath: normalizedStoragePath,
      publicUrl: null,
      fileName: getFileName(normalizedStoragePath),
    };
  }

  async checkTokenConnection(): Promise<{ ok: true; expiresAt: string | null }> {
    await this.getValidToken();
    return {
      ok: true,
      expiresAt: this.tokenCache === null ? null : new Date(this.tokenCache.expiresAt).toISOString(),
    };
  }

  private async postJson(endpoint: string, payload: unknown): Promise<unknown> {
    const token = await this.getValidToken();
    return this.requestJson(endpoint, {
      method: 'POST',
      headers: {
        ...this.buildHeaders(token),
        'content-type': 'application/json',
      },
      data: payload,
    });
  }

  private async getValidToken(): Promise<string> {
    const now = Date.now();
    if (this.tokenCache !== null && this.tokenCache.expiresAt > now + 30_000) {
      return this.tokenCache.token;
    }

    const endpoint = this.requireTokenEndpoint();
    this.logger.log('Solicitando token de OneDrive.');
    const payload = await this.requestJson(endpoint, {
      method: 'GET',
      headers: this.buildHeaders(),
    });
    const unwrappedPayload = unwrapPayload(payload);
    const token = extractToken(unwrappedPayload);
    this.tokenCache = {
      token,
      expiresAt: extractExpiry(unwrappedPayload, this.defaultTokenTtlMs),
    };
    this.logger.log('Token de OneDrive obtenido correctamente.');

    return token;
  }

  private async requestJson(endpoint: string, config: AxiosRequestConfig): Promise<unknown> {
    let response: AxiosResponse<unknown>;
    const normalizedEndpoint = normalizeEndpoint(endpoint);

    try {
      response = await axios.request<unknown>({
        responseType: 'arraybuffer',
        validateStatus: () => true,
        maxBodyLength: Infinity,
        maxContentLength: Infinity,
        httpsAgent: this.httpsAgent,
        ...config,
        url: normalizedEndpoint,
      });
    } catch (error) {
      throw new ServiceUnavailableException(`No se pudo conectar con el servicio OneDrive: ${getErrorMessage(error)}`);
    }

    const payload = parseAxiosPayload(response.data);
    if (response.status < 200 || response.status >= 300) {
      throw new BadGatewayException(`OneDrive respondio con ${response.status}: ${stringifyPayload(payload)}`);
    }

    return unwrapPayload(payload);
  }

  private buildHeaders(token?: string, extraHeaders?: Record<string, string>): Record<string, string> {
    const idAplicacion = this.requireConfig('ID_APLICACION_ONEDRIVE');
    const idCredencial = this.requireConfig('ID_CREDENCIAL_ONEDRIVE');
    const jwtSecret = this.requireConfig('JWT_SECRET_ONEDRIVE');
    const headers: Record<string, string> = {
      idAplicacion,
      idCredencial,
      jwtSecret,
      ...(extraHeaders ?? {}),
    };

    if (token !== undefined) {
      headers.Authorization = `Bearer ${token}`;
    }

    return headers;
  }

  private extractFileMetadata(payload: unknown): {
    storagePath: string | null;
    publicUrl: string | null;
    fileName: string | null;
  } {
    const candidates: unknown[] = [];
    const source = unwrapPayload(payload);

    pushCandidate(candidates, source);
    if (isRecord(source)) {
      pushCandidate(candidates, source.file);
      pushCandidate(candidates, source.archivo);
      pushCandidate(candidates, source.item);
      pushCandidate(candidates, source.response);
      pushCandidate(candidates, source.resultado);
      pushCandidate(candidates, firstArrayItem(source.listado));
      if (isRecord(source.data)) {
        pushCandidate(candidates, firstArrayItem(source.data.listado));
        pushCandidate(candidates, source.data.file);
        pushCandidate(candidates, source.data.archivo);
      }
    }

    for (const candidate of candidates) {
      if (!isRecord(candidate)) {
        continue;
      }

      const storagePath = firstText(
        candidate.rutaCompleta,
        candidate.rutaArchivo,
        candidate.ruta,
        candidate.path,
        candidate.fullPath,
      );
      const publicUrl = firstText(
        candidate.download,
        candidate.downloadUrl,
        candidate.urlDescarga,
        candidate.url,
        candidate.webUrl,
      );
      const fileName = firstText(
        candidate.name,
        candidate.nombre,
        candidate.nombreArchivo,
        candidate.fileName,
        candidate.filename,
      );

      if (storagePath !== null || publicUrl !== null || fileName !== null) {
        return {
          storagePath,
          publicUrl,
          fileName,
        };
      }
    }

    return {
      storagePath: null,
      publicUrl: null,
      fileName: null,
    };
  }

  private requireTokenEndpoint(): string {
    const tokenEndpoint = this.getOptionalEndpoint('TOKEN_ACCESO_SERVICIOS')
      ?? this.getOptionalEndpoint('TOKEN_ONEDRIVE');
    if (tokenEndpoint === null) {
      throw new ServiceUnavailableException('No se configuro TOKEN_ACCESO_SERVICIOS ni TOKEN_ONEDRIVE.');
    }

    return tokenEndpoint;
  }

  private requireEndpoint(name: string, label: string): string {
    const endpoint = this.getOptionalEndpoint(name);
    if (endpoint === null) {
      throw new ServiceUnavailableException(`No se configuro la URL de OneDrive para ${label}: ${name}.`);
    }

    return endpoint;
  }

  private getOptionalEndpoint(name: string): string | null {
    const value = this.configService.get<string>(name)?.trim();
    return value === undefined || value.length === 0 ? null : value;
  }

  private requireConfig(name: string): string {
    const value = this.configService.get<string>(name)?.trim();
    if (value === undefined || value.length === 0) {
      throw new ServiceUnavailableException(`Falta configurar ${name} para OneDrive.`);
    }

    return value;
  }
}

function parseAxiosPayload(data: unknown): unknown {
  if (Buffer.isBuffer(data)) {
    return parseTextPayload(data.toString('utf8'));
  }

  if (data instanceof ArrayBuffer) {
    return parseTextPayload(Buffer.from(data).toString('utf8'));
  }

  if (typeof data === 'string') {
    return parseTextPayload(data);
  }

  return data;
}

function parseTextPayload(text: string): unknown {
  if (text.trim().length === 0) {
    return null;
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}

function unwrapPayload(payload: unknown): unknown {
  if (!isRecord(payload)) {
    return payload;
  }

  const source = payload.data ?? payload;
  if (isRecord(source) && Array.isArray(source.listado)) {
    return source.listado[0] ?? source;
  }

  return source;
}

function extractToken(payload: unknown): string {
  if (!isRecord(payload)) {
    throw new BadGatewayException('La respuesta de token de OneDrive no tiene formato valido.');
  }

  const token = firstText(payload.access_token, payload.token, payload.Token, payload.accessToken);
  if (token === null) {
    throw new BadGatewayException('La respuesta de token de OneDrive no contiene un token valido.');
  }

  return token;
}

function extractExpiry(payload: unknown, fallbackTtlMs: number): number {
  const now = Date.now();
  if (!isRecord(payload)) {
    return now + fallbackTtlMs;
  }

  const rawDate = firstText(payload.tokfechaexp, payload.tokFechaExp, payload.exp, payload.expiresAt);
  if (rawDate !== null) {
    const timestamp = new Date(rawDate).getTime();
    if (Number.isFinite(timestamp)) {
      return timestamp;
    }
  }

  const expiresIn = Number(payload.expires_in ?? payload.expiresIn);
  if (Number.isFinite(expiresIn) && expiresIn > 0) {
    return now + expiresIn * 1000;
  }

  return now + fallbackTtlMs;
}

function normalizeEndpoint(endpoint: string): string {
  const trimmedEndpoint = endpoint.trim();
  return trimmedEndpoint.endsWith('/') ? trimmedEndpoint : `${trimmedEndpoint}/`;
}

function normalizeStoragePath(storagePath: string): string {
  return storagePath
    .replace(/\\/g, '/')
    .replace(/\/{2,}/g, '/')
    .replace(/^\/+|\/+$/g, '');
}

function getDirectoryPath(storagePath: string): string {
  const normalizedPath = normalizeStoragePath(storagePath);
  const index = normalizedPath.lastIndexOf('/');
  return index === -1 ? normalizedPath : normalizedPath.slice(0, index);
}

function getFileName(storagePath: string): string | null {
  const normalizedPath = normalizeStoragePath(storagePath);
  const index = normalizedPath.lastIndexOf('/');
  const fileName = index === -1 ? normalizedPath : normalizedPath.slice(index + 1);
  return fileName.length > 0 ? fileName : null;
}

function firstText(...values: unknown[]): string | null {
  for (const value of values) {
    const text = typeof value === 'string'
      ? value.trim()
      : value !== null && value !== undefined
        ? String(value).trim()
        : '';

    if (text.length > 0) {
      return text;
    }
  }

  return null;
}

function firstArrayItem(value: unknown): unknown {
  return Array.isArray(value) ? value[0] : undefined;
}

function pushCandidate(candidates: unknown[], value: unknown): void {
  if (value !== null && value !== undefined) {
    candidates.push(value);
  }
}

function stringifyPayload(payload: unknown): string {
  if (typeof payload === 'string') {
    return payload.slice(0, 500);
  }

  try {
    return JSON.stringify(payload).slice(0, 500);
  } catch {
    return 'Respuesta no serializable.';
  }
}

function assertOperationSucceeded(payload: unknown, operation: string): void {
  const source = unwrapPayload(payload);
  if (!isRecord(source)) {
    return;
  }

  const failed = source.success === false
    || source.exito === false
    || source.ok === false
    || source.success === 'false';
  if (!failed) {
    return;
  }

  const detail = firstText(source.message, source.mensaje, source.error, source.detalle)
    ?? 'El servicio remoto rechazo la operacion.';
  throw new BadGatewayException(`No se pudo ${operation}: ${detail}`);
}

function getErrorMessage(error: unknown): string {
  if (axios.isAxiosError(error)) {
    const status = error.response?.status;
    const statusText = error.response?.statusText;
    const responseDetail = status === undefined ? '' : ` (${status} ${statusText ?? ''})`;
    return `${error.message}${responseDetail}`;
  }

  return error instanceof Error ? error.message : 'Error desconocido.';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
