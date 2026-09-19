/**
 * Validación de documentos que puede ejecutarse tanto en navegador como en
 * procesos de servidor. No reexporta el índice completo: ese índice también
 * publica utilidades de rutas de activos que dependen de `import.meta.url`.
 */
export {
  isInlineImageDataUrl,
  parseDesignDocument,
  type DesignDocumentParseResult,
} from "./validation/parse-document.ts";
