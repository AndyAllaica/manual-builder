import { type CapturedSelectionRecord } from './manual-builder';

interface PendingCaptureImageRecord {
  id: string;
  imageDataUrl: string;
}

const DATABASE_NAME = 'manual-builder-media';
const DATABASE_VERSION = 1;
const STORE_NAME = 'pending-capture-images';

let databasePromise: Promise<IDBDatabase> | null = null;
let writeQueue: Promise<void> = Promise.resolve();

export function replacePendingCaptureImages(captures: CapturedSelectionRecord[]): Promise<void> {
  const nextWrite = writeQueue
    .catch(() => undefined)
    .then(async () => {
      const database = await openDatabase();
      const transaction = database.transaction(STORE_NAME, 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      store.clear();

      for (const capture of captures) {
        store.put({ id: capture.id, imageDataUrl: capture.imageDataUrl } satisfies PendingCaptureImageRecord);
      }

      await waitForTransaction(transaction);
    });

  writeQueue = nextWrite;
  return nextWrite;
}

export async function loadPendingCaptureImage(captureId: string): Promise<string | null> {
  await writeQueue.catch(() => undefined);
  const database = await openDatabase();
  const transaction = database.transaction(STORE_NAME, 'readonly');
  const transactionCompleted = waitForTransaction(transaction);
  const request = transaction.objectStore(STORE_NAME).get(captureId);
  const record = await requestResult<PendingCaptureImageRecord | undefined>(request);
  await transactionCompleted;
  return record?.imageDataUrl ?? null;
}

function openDatabase(): Promise<IDBDatabase> {
  if (databasePromise !== null) {
    return databasePromise;
  }

  databasePromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(STORE_NAME)) {
        database.createObjectStore(STORE_NAME, { keyPath: 'id' });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('No se pudo abrir IndexedDB.'));
  });

  return databasePromise;
}

function requestResult<TResult>(request: IDBRequest<TResult>): Promise<TResult> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('Fallo una operacion de IndexedDB.'));
  });
}

function waitForTransaction(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error ?? new Error('Fallo la transaccion de IndexedDB.'));
    transaction.onabort = () => reject(transaction.error ?? new Error('Se cancelo la transaccion de IndexedDB.'));
  });
}
