import { invoke } from '@tauri-apps/api/core';
import { getLocale, t } from '../i18n/i18n';
import { saveFilters } from './dialogFilters';
import type { SyntaxId } from './syntaxRegistry';
export interface DocumentFile {
  path: string;
  name: string;
  text: string;
  encoding: 'UTF-8' | 'UTF-8 BOM' | 'UTF-16 LE' | 'UTF-16 BE';
  lineEnding: 'LF' | 'CRLF';
  revision: string;
}
export interface SaveRequest {
  path: string | null;
  text: string;
  encoding: DocumentFile['encoding'];
  lineEnding: DocumentFile['lineEnding'];
  revision: string | null;
  saveAs: boolean;
  suggestedName: string;
}
export const files = {
  open: () => invoke<DocumentFile[]>('open_dialog', { locale: getLocale() }),
  pending: () => invoke<({ Ok: DocumentFile } | { Err: string })[]>('take_pending'),
  read: (path: string) => invoke<DocumentFile>('read_document', { path }),
  check: (path: string) => invoke<string>('check_document', { path }),
  save: (request: SaveRequest, syntax: SyntaxId = 'text') =>
    invoke<DocumentFile | null>('save_document', {
      request: { ...request, filters: saveFilters(syntax, request.suggestedName, t) },
    }),
  image: (document: string, source: string) => invoke<string>('local_image', { document, source }),
  link: (url: string) => invoke<void>('open_link', { url }),
};
