import { Injectable } from '@nestjs/common';
import { AxiosRequestConfig } from 'axios';
import { firstValueFrom } from 'rxjs';

import { envs } from '@config/envs';
import { ExceptionManagerService } from '@sharedServices/exception-manager.service';
import { HttpsCustomService } from '@sharedServices/https.service';

type TokenCache = { token: string; expiresAt: number };

@Injectable()
export class OneDriveService {
   private readonly tokenEndpoint = envs.token_acc_onedrive;
   private readonly obtenerArchivoEndpoint = envs.obtn_archivo;
   private readonly subirArchivoEndpoint = envs.subir_archivo;
   private readonly subirListaArchivosEndpoint = envs.sub_list_archivos;
   private readonly obtenerListaArchivosEndpoint = envs.obtn_list_archivos;
   private readonly eliminarArchivoEndpoint = envs.eliminar_archivo;
   private readonly defaultTokenTtlMs = 1000 * 60 * 60 * 6; // 6h fallback

   private tokenCache?: TokenCache;

   constructor(
      private readonly https: HttpsCustomService,
      private readonly excManager: ExceptionManagerService,
   ) {}

   async obtenerArchivo(
      payload: any,
      options: {
         responseType?: AxiosRequestConfig['responseType'];
         headers?: Record<string, string>;
      } = {},
   ) {
      return this.callPost(this.obtenerArchivoEndpoint, payload, options);
   }

   async subirArchivo(payload: any, headers?: Record<string, string>) {
      return this.callPost(this.subirArchivoEndpoint, payload, { headers });
   }

   async subirListaArchivos(payload: any, headers?: Record<string, string>) {
      return this.callPost(this.subirListaArchivosEndpoint, payload, {
         headers,
      });
   }

   async obtenerListaArchivos(payload: any) {
      return this.callPost(this.obtenerListaArchivosEndpoint, payload);
   }

   async descargarUrl(url: string) {
      try {
         const { data } = await firstValueFrom(
            this.https.getWithCustomHeaders(url, {}, { responseType: 'arraybuffer' }),
         );
         return data;
      } catch (error) {
         this.excManager.handleDBExceptions('OneDriveService.descargarUrl', error);
      }
   }

   async eliminarArchivo(payload: any, headers?: Record<string, string>) {
      return this.callPost(this.eliminarArchivoEndpoint, payload, { headers });
   }

   /**
    * Extrae metadatos de archivo de respuestas heterogeneas del API OneDrive.
    * Prioriza URL de descarga (download/downloadUrl/url/webUrl) y ruta.
    */
   extraerMetadatosArchivo(payload: any): {
      rutaArchivo: string | null;
      urlArchivo: string | null;
      nombreArchivo: string | null;
   } {
      const candidates: any[] = [];
      const pushCandidate = (value: any) => {
         if (!value) return;
         candidates.push(value);
      };

      const source = payload?.data ?? payload;
      pushCandidate(source);
      pushCandidate(source?.file);
      pushCandidate(source?.archivo);
      pushCandidate(source?.item);
      pushCandidate(source?.response);
      pushCandidate(source?.resultado);
      pushCandidate(source?.listado?.[0]);
      pushCandidate(source?.data?.listado?.[0]);
      pushCandidate(source?.data?.file);
      pushCandidate(source?.data?.archivo);

      for (const item of candidates) {
         const ruta = this.normalizeText(
            item?.rutaCompleta ||
               item?.rutaArchivo ||
               item?.ruta ||
               item?.path ||
               item?.fullPath,
         );
         const url = this.normalizeText(
            item?.download ||
               item?.downloadUrl ||
               item?.urlDescarga ||
               item?.url ||
               item?.webUrl,
         );
         const nombre = this.normalizeText(
            item?.name ||
               item?.nombre ||
               item?.nombreArchivo ||
               item?.fileName ||
               item?.filename,
         );

         if (ruta || url || nombre) {
            return {
               rutaArchivo: ruta,
               urlArchivo: url,
               nombreArchivo: nombre,
            };
         }
      }

      return {
         rutaArchivo: null,
         urlArchivo: null,
         nombreArchivo: null,
      };
   }

   /**
    * Obtiene/renueva metadatos de descarga usando la ruta del archivo en OneDrive.
    * Se usa para refrescar URL cuando no existe o expira.
    */
   async obtenerMetadatosArchivoPorRuta(rutaArchivo: string): Promise<{
      rutaArchivo: string;
      urlArchivo: string | null;
      nombreArchivo: string | null;
   }> {
      const ruta = this.normalizeText(rutaArchivo);
      if (!ruta) {
         this.excManager.handleNotAcceptableException(
            'Debe enviar una ruta valida del archivo.',
         );
      }

      const rutaSegura = ruta as string;
      const intentos: Array<() => Promise<any>> = [
         () => this.obtenerArchivo({ ruta: rutaSegura }),
         () => this.obtenerListaArchivos({ rutas: [rutaSegura] }),
      ];

      for (const intento of intentos) {
         try {
            const response = await intento();
            const metadata = this.extraerMetadatosArchivo(response);
            if (metadata.urlArchivo || metadata.rutaArchivo || metadata.nombreArchivo) {
               return {
                  rutaArchivo: metadata.rutaArchivo || rutaSegura,
                  urlArchivo: metadata.urlArchivo,
                  nombreArchivo: metadata.nombreArchivo,
               };
            }
         } catch (error) {
            // Best-effort: si el primer intento falla, probamos el siguiente.
            this.excManager.writeLog(
               'OneDriveService',
               `No se pudo resolver metadatos por ruta ${rutaSegura}: ${String(error?.message || error)}`,
               'WARN',
            );
         }
      }

      return {
         rutaArchivo: rutaSegura,
         urlArchivo: null,
         nombreArchivo: null,
      };
   }

   private async callPost(
      endpoint: string | undefined,
      payload: any,
      options: {
         headers?: Record<string, string>;
         responseType?: AxiosRequestConfig['responseType'];
      } = {},
   ) {
      try {
         const url = this.normalizeEndpoint(endpoint, 'operación');
         const token = await this.getValidToken();
         const headers = this.buildHeaders(token, options.headers);
         const config: AxiosRequestConfig = {};
         if (options.responseType) config.responseType = options.responseType;

         const { data } = await firstValueFrom(
            this.https.postWithCustomHeaders(url, payload, headers, config),
         );
         const parsed = this.tryParseBuffer(data);
         return (parsed as any)?.data ?? parsed;
      } catch (error) {
         this.excManager.handleDBExceptions('OneDriveService', error);
      }
   }

   private async getValidToken(): Promise<string> {
      const now = Date.now();
      if (this.tokenCache && this.tokenCache.expiresAt > now + 30_000) {
         return this.tokenCache.token;
      }
      const token = await this.fetchToken();
      if (!token) {
         this.excManager.handleNotAcceptableException(
            'No se pudo obtener el token de OneDrive.',
         );
      }
      return token as string;
   }

   private async fetchToken(): Promise<string | undefined> {
      try {
         const endpoint = this.normalizeEndpoint(this.tokenEndpoint, 'token');
         const headers = this.buildHeaders(undefined);
         const { data } = await firstValueFrom(
            this.https.getWithCustomHeaders(endpoint, headers),
         );
         const payload = this.unwrapPayload(this.tryParseBuffer(data));
         const token = this.extractToken(payload);
         const expiresAt = this.extractExpiry(payload);
         this.setTokenCache(token, expiresAt);
         this.excManager.writeLog('OneDriveService', 'Token obtenido con exito');
         return token;
      } catch (error) {
         this.excManager.handleDBExceptions('OneDriveService', error);
      }
   }

   private unwrapPayload(data: any) {
      const payload = data?.data ?? data;
      if (payload?.listado && Array.isArray(payload.listado)) {
         return payload.listado[0] ?? payload;
      }
      return payload;
   }

   private tryParseBuffer(data: any) {
      if (Buffer.isBuffer(data)) {
         const asString = data.toString();
         try {
            return JSON.parse(asString);
         } catch {
            return data;
         }
      }
      return data;
   }

   private normalizeText(value: unknown): string | null {
      const text =
         typeof value === 'string'
            ? value.trim()
            : value !== null && value !== undefined
              ? String(value).trim()
              : '';
      return text || null;
   }

   private extractToken(tokenInfo: any): string {
      const token =
         tokenInfo?.access_token ||
         tokenInfo?.token ||
         tokenInfo?.Token ||
         tokenInfo?.accessToken;
      if (!token || typeof token !== 'string') {
         this.excManager.handleNotAcceptableException(
            'La respuesta de token no contiene un valor valido.',
         );
      }
      return token as string;
   }

   private extractExpiry(tokenInfo: any): number {
      const now = Date.now();
      const rawDate =
         tokenInfo?.tokfechaexp ||
         tokenInfo?.tokFechaExp ||
         tokenInfo?.exp ||
         tokenInfo?.expiresAt;
      if (rawDate) {
         const timestamp = new Date(rawDate).getTime();
         if (Number.isFinite(timestamp)) return timestamp;
      }

      const expiresInSec =
         Number(tokenInfo?.expires_in) || Number(tokenInfo?.expiresIn);
      if (expiresInSec && Number.isFinite(expiresInSec)) {
         return now + expiresInSec * 1000;
      }

      return now + this.defaultTokenTtlMs;
   }

   private setTokenCache(token: string, expiresAt: number) {
      this.tokenCache = { token, expiresAt };
   }

   private buildHeaders(
      token?: string,
      extraHeaders?: Record<string, string>,
   ): Record<string, string> {
      const baseHeaders = this.getBaseHeaders();
      const headers: Record<string, string> = {
         ...baseHeaders,
         ...(extraHeaders ?? {}),
      };
      if (token) headers.Authorization = `Bearer ${token}`;
      return headers;
   }

   private getBaseHeaders(): Record<string, string> {
      const {
         idAplicacionOnedrive,
         idCredencialOnedrive,
         jwtSecretOnedrive,
      } = envs;
      if (!idAplicacionOnedrive || !idCredencialOnedrive || !jwtSecretOnedrive) {
         this.excManager.handleNotAcceptableException(
            'Faltan las cabeceras idAplicacion, idCredencial o jwtSecret.',
         );
      }
      return {
         idAplicacion: idAplicacionOnedrive as string,
         idCredencial: idCredencialOnedrive as string,
         jwtSecret: jwtSecretOnedrive as string,
      };
   }

   private normalizeEndpoint(endpoint?: string, name?: string) {
      if (!endpoint || typeof endpoint !== 'string') {
         const label = name ? ` del servicio ${name}` : '';
         this.excManager.handleNotAcceptableException(
            `No se configuró la url${label} de OneDrive.`,
         );
         throw new Error('Endpoint no configurado'); // satisfy TS return type
      }
      const trimmed = endpoint.trim();
      return trimmed.endsWith('/') ? trimmed : `${trimmed}/`;
   }
}
