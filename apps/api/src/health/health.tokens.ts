/**
 * Token de inyección de las sondas de infraestructura.
 *
 * Las implementaciones concretas se componen en el módulo, no en el servicio,
 * para que el dominio de salud dependa del puerto y no de PostgreSQL o Redis.
 */
export const DEPENDENCY_PROBES = Symbol("DEPENDENCY_PROBES");
