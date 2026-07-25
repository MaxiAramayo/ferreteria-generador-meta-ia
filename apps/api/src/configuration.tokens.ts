/**
 * Configuración validada del proceso.
 *
 * Ningún módulo de negocio lee `process.env`: recibe este token, cuyo valor se
 * produce una única vez en el bootstrap.
 */
export const API_CONFIGURATION = Symbol("API_CONFIGURATION");
