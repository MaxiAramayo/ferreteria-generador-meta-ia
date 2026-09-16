# Presupuestos de rendimiento y costo

Un presupuesto acá es un número que se mide, no una intención. Si lo medido lo
cruza, la medición falla y hay que explicar por qué, aunque la pantalla «se
sienta rápida».

## Dónde viven

En [`operational-budgets.ts`](../../packages/domain/src/operational-budgets.ts),
dentro del dominio, porque la medición, el tablero y el runbook tienen que
juzgar con el mismo criterio. Los de cola no se declaran de nuevo: son los
umbrales con los que la salud operativa ya pide atención, así que presupuestar
por encima sería aceptar como normal algo que el panel muestra en rojo.

La versión vigente es `operational-budgets/2026-09-15.2`.

## Cómo se miden

```bash
pnpm budget:load
```

Levanta una base efímera con volumen representativo —500 publicaciones con sus
revisiones, 40 programaciones con 240 turnos y 120 avisos acumulados en el
outbox— y la API real, y recorre seis escenarios. No usa navegador: mide la API,
que es donde se gasta el tiempo. Corre en CI junto con los recorridos de punta a
punta.

| Escenario | Qué comprueba |
|---|---|
| Latencia con volumen | p50, p95 y p99 de sesión, listado, calendario, una ejecución de generación y salud operativa |
| Concurrencia | 25 listados en paralelo, para ver la cola de la distribución |
| Paginación | El listado devuelve su página por omisión y rechaza pedir más filas que el máximo |
| Backlog y recuperación | Empieza incumpliendo el presupuesto de outbox y mide cuánto tarda en drenarse |
| Costo por operación | Atribuye el gasto al brief, a cada variante y a la pieza, y compara reservado contra liquidado |
| Degradación ante rate limit | El login corta con 429 y sin errores del servidor |

## Presupuestos vigentes

| Lectura | p95 | p99 |
|---|---|---|
| Sesión activa | 60 ms | 120 ms |
| Leer una ejecución de generación | 80 ms | 160 ms |
| Listado de publicaciones | 100 ms | 200 ms |
| Salud operativa | 100 ms | 200 ms |
| Calendario de programación | 120 ms | 240 ms |

| Cola | Pendientes | Antigüedad |
|---|---|---|
| Avisos del outbox | 20 | 5 min |
| Turnos vencidos sin despachar | 1 | 5 min |

| Operación | Presupuesto |
|---|---|
| Brief con evidencia | US$ 0,06 |
| Variante generada | US$ 0,15 |
| Pieza publicable, con su brief y sus variantes | US$ 0,25 |

Publicar no agrega gasto de IA, así que atribuirle a la pieza su brief y sus
variantes es atribuirle todo lo que costó producirla.

## Lo medido el 2026-09-15

Local, contra el PostgreSQL 17 del compose:

| Lectura | p50 | p95 | p99 |
|---|---|---|---|
| Sesión activa | 4 ms | 5 ms | 8 ms |
| Leer una ejecución de generación | 5 ms | 7 ms | 9 ms |
| Salud operativa | 5 ms | 7 ms | 8 ms |
| Listado de publicaciones | 7 ms | 9 ms | 9 ms |
| Calendario de programación | 6 ms | 8 ms | 9 ms |

- 25 listados en paralelo: p95 de 46 ms.
- El listado devuelve 20 de 502 piezas y rechaza pedir más de 100.
- 120 avisos acumulados, el más viejo de 12 minutos, drenados en 0,11 s: unos
  1000 por segundo.
- Brief US$ 0,0165 con 5631 tokens; variante US$ 0,0548 liquidada contra
  US$ 0,0550 reservada; pieza publicable US$ 0,1261.
- El login corta con 429 tras cinco rechazos, sin errores del servidor.

El presupuesto quedó en unas diez veces lo medido: tolera una máquina más lenta
y falla igual si una consulta se degrada un orden de magnitud, que es la
regresión que importa detectar.

El mismo día, en CI —runner de GitHub, más lento que la máquina local—: p95
entre 4 y 18 ms en las cinco lecturas, 130 ms con 25 listados en paralelo y 619
avisos por segundo. El margen quedó entre cinco y diez veces, que es el buscado.

## Timeout y concurrencia de lo que tarda

El render y la generación no se miden acá porque su tiempo lo pone el proveedor:
se acotan por configuración, no por presupuesto de latencia.

- `WORKER_CONCURRENCY` limita cuántos trabajos toma el worker a la vez.
- El timeout de OpenAI es de 60 s por omisión
  (`packages/configuration/src/providers.ts`).
- La política de generación acota intentos por día y por persona, y el
  presupuesto mensual en micro-USD.

## Alerta antes del corte

El presupuesto mensual de IA avisa antes de cortar: la salud operativa marca
atención al 80 % y urgente al 100 %, con los mismos umbrales que usa la bandeja
de alertas. El corte lo aplica la política de generación al admitir la
ejecución, así que quien opera ve el aviso antes de que una pieza sea rechazada
por presupuesto.

## Lo que no se mide, y por qué

La verificación de `P7-T05` pedía además una corrida sobre **staging**. El
2026-09-15 se decidió que no aplica: el sistema lo opera una sola persona, así
que la carga real es esa, y lo que puede regresar —la forma de las consultas con
volumen, la paginación, el drenaje del outbox y el costo por operación— ya se
mide acá y en CI. Si algún día lo usa un equipo, la corrida sobre staging vuelve
a tener sentido: agrega red, disco real y ruido de un host compartido.

El timeout y la concurrencia de render y generación siguen elegidos por
configuración y no por medición propia: medirlos exige pagar generaciones. Queda
abierto como el único criterio sin cerrar de la tarea.
