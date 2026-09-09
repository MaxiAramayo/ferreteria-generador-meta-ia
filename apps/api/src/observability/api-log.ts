import { createLogEmitter, type LogEmitter } from "@aramayo/observability";

/**
 * Emisor único del proceso.
 *
 * El destino es `stdout` porque el proceso corre en contenedor y quien recoge
 * los logs es la plataforma, no la aplicación. Las pruebas construyen su propio
 * emisor con otra escritura en lugar de sustituir este.
 */
export const apiLog: LogEmitter = createLogEmitter("api");
