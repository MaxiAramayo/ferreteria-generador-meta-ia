import { createLogEmitter, type LogEmitter } from "@aramayo/observability";

/**
 * Emisor único del proceso. Mismo criterio que en la API: `stdout` es el
 * destino y la plataforma recoge; las pruebas construyen su propio emisor.
 */
export const workerLog: LogEmitter = createLogEmitter("worker");
