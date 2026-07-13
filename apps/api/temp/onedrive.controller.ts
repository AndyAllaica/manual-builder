import {
   BadRequestException,
   Body,
   Controller,
   Post,
   UploadedFile,
   UploadedFiles,
   UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor, FilesInterceptor } from '@nestjs/platform-express';
import multer from 'multer';
import FormData from 'form-data';

import { OneDriveService } from '@apisServices/onedrive.service';

@Controller('onedrive')
export class OneDriveController {
   private readonly rutaRaiz = 'GESTION_DE_RESIDUOS';

   constructor(private readonly oneDriveService: OneDriveService) {}

   @Post('archivo')
   obtenerArchivo(@Body() body: any) {
      const { payload, responseType, headers } = body || {};
      const data = this.ensureRutaPayload(payload ?? body);
      return this.oneDriveService.obtenerArchivo(data, {
         responseType,
         headers,
      });
   }

   @Post('archivo/eliminar')
   eliminarArchivo(@Body() body: any) {
      const { payload, headers } = body || {};
      const data = this.ensureRutaPayload(payload ?? body);
      return this.oneDriveService.eliminarArchivo(data, headers);
   }

   @Post('archivo/subir')
   @UseInterceptors(
      FileInterceptor('file', {
         storage: multer.memoryStorage(),
      }),
   )
   async subirArchivo(
      @UploadedFile() file: Express.Multer.File,
      @Body() body: any,
   ) {
      const formData = this.buildFormData(file, this.ensureRutaFlags(body));
      return this.oneDriveService.subirArchivo(formData, formData.getHeaders());
   }

   @Post('archivos/subir')
   @UseInterceptors(
      FilesInterceptor('files', undefined, {
         storage: multer.memoryStorage(),
      }),
   )
   async subirListaArchivos(
      @UploadedFiles() files: Express.Multer.File[],
      @Body() body: any,
   ) {
      const formData = this.buildFormData(files, this.ensureRutaFlags(body));
      return this.oneDriveService.subirListaArchivos(formData, formData.getHeaders());
   }

   @Post('archivos')
   obtenerLista(@Body() body: any) {
      return this.oneDriveService.obtenerListaArchivos(this.ensureRutaPayload(body));
   }

   private buildFormData(
      fileInput: Express.Multer.File | Express.Multer.File[] | undefined,
      body: any,
   ): FormData {
      const formData = new FormData();
      if (body) this.appendBody(formData, body);
      if (Array.isArray(fileInput)) {
         fileInput.forEach((file) => this.appendFile(formData, file, 'files'));
      } else if (fileInput) {
         const customName =
            body?.nombreDestino ||
            body?.nombreArchivo ||
            body?.filename ||
            undefined;
         this.appendFile(formData, fileInput, 'file', customName);
      }
      return formData;
   }

   private appendFile(
      formData: FormData,
      file: Express.Multer.File,
      key: string,
      customName?: string,
   ) {
      formData.append(key, file.buffer, {
         filename: customName || file.originalname,
         contentType: file.mimetype,
      });
   }

   private appendBody(formData: FormData, body: any) {
      Object.entries(body).forEach(([key, value]) => {
         if (Array.isArray(value)) {
            value.forEach((v) => formData.append(key, this.normalizeValue(v)));
         } else {
            formData.append(key, this.normalizeValue(value));
         }
      });
   }

   private ensureRutaFlags(body: any) {
      const newBody: any = body && typeof body === 'object' ? { ...body } : {};
      const rutaEntrada = newBody.rutaDestino ?? newBody.ruta ?? newBody.path ?? this.rutaRaiz;
      const rutaRaw = this.normalizeRuta(String(rutaEntrada));

      newBody.ruta = rutaRaw;
      newBody.rutaDestino = rutaRaw;
      newBody.path = rutaRaw;
      if (typeof newBody.crearRuta === 'undefined') {
         newBody.crearRuta = true;
      }
      return newBody;
   }

   private ensureRutaPayload(body: any) {
      if (!body || typeof body !== 'object') return body;
      const payload: any = { ...body };

      if (Array.isArray(payload.rutas)) {
         payload.rutas = payload.rutas
            .map((ruta: any) => this.normalizeRuta(String(ruta ?? '')))
            .filter((ruta: string) => !!ruta);
      }

      if (payload.ruta !== undefined) {
         payload.ruta = this.normalizeRuta(String(payload.ruta ?? ''));
      }
      if (payload.rutaDestino !== undefined) {
         payload.rutaDestino = this.normalizeRuta(String(payload.rutaDestino ?? ''));
      }
      if (payload.path !== undefined) {
         payload.path = this.normalizeRuta(String(payload.path ?? ''));
      }

      return payload;
   }

   private normalizeValue(value: any): any {
      if (value === undefined || value === null) return '';
      if (Buffer.isBuffer(value)) return value;
      if (typeof value === 'object' && !(value instanceof Date)) {
         return JSON.stringify(value);
      }
      return String(value);
   }

   private normalizeRuta(ruta: string) {
      const raw = typeof ruta === 'string' ? ruta.trim() : '';
      if (!raw) return this.rutaRaiz;

      if (/^[A-Za-z]:[\\/]/.test(raw) || raw.startsWith('\\\\') || raw.startsWith('/')) {
         throw new BadRequestException('La ruta enviada no es valida.');
      }

      let normalized = raw.replace(/\\/g, '/');
      normalized = normalized.replace(/\/{2,}/g, '/');
      normalized = normalized.replace(/^\/+|\/+$/g, '');

      if (!normalized) return this.rutaRaiz;

      const segments = normalized.split('/').map((segment) => segment.trim());
      if (segments.some((segment) => segment === '..')) {
         throw new BadRequestException('La ruta enviada no es valida.');
      }

      const rootUpper = this.rutaRaiz.toUpperCase();
      const normalizedUpper = normalized.toUpperCase();
      if (normalizedUpper === rootUpper) {
         return this.rutaRaiz;
      }

      if (normalizedUpper.startsWith(`${rootUpper}/`)) {
         return `${this.rutaRaiz}/${normalized.slice(this.rutaRaiz.length + 1)}`;
      }

      return `${this.rutaRaiz}/${normalized}`;
   }
}
