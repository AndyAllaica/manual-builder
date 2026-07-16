import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { generateManualPdf } from '../../apps/extension/lib/pdf/manual-pdf.generator';
import type { ManualExport } from '../../apps/extension/lib/pdf/manual-pdf.types';

describe('PDF resource block removal', () => {
  it('does not render the page/resource block in either orientation', async () => {
    Object.defineProperty(globalThis, 'window', {
      configurable: true,
      value: { setTimeout: globalThis.setTimeout.bind(globalThis) },
    });
    const manual: ManualExport = {
      title: 'Manual de prueba',
      steps: [{
        order: 1,
        title: 'Registrar informacion',
        description: 'Complete la informacion solicitada.',
        pageTitle: 'Insercion Laboral',
        url: 'http://localhost/',
        guide: { expectedResult: 'La informacion queda registrada.' },
      }],
    };
    const outputDirectory = resolve(process.cwd(), 'tmp/pdfs');
    await mkdir(outputDirectory, { recursive: true });

    for (const orientation of ['landscape', 'portrait'] as const) {
      const bytes = await generateManualPdf(manual, { includeCover: false, orientation });
      await writeFile(resolve(outputDirectory, `resource-block-${orientation}.pdf`), bytes);
      expect(bytes.byteLength).toBeGreaterThan(1_000);
    }
  });
});
