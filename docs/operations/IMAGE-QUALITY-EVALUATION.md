# Evaluación de calidad de imágenes

Estado: en implementación por `P4-T08`.

## Propósito

La puerta separa dos preguntas que no se compensan entre sí:

1. **Exactitud comercial y técnica:** producto, precio, stock, CTA, vigencia y
   composición coinciden con el snapshot aprobado.
2. **Calidad visual humana:** jerarquía, composición, fidelidad del producto,
   marca, contexto y lectura móvil alcanzan el estándar de Aramayo.

Una pieza atractiva con un dato incorrecto falla. Una pieza factual correcta no
queda aprobada hasta superar la revisión humana ciega.

## Dataset versionado

`image-quality/2026-08-07.2` contiene 18 casos sintéticos: los seis perfiles
visuales por `feed`, `cuadrado` e `historia`. La matriz incluye herramientas,
lubricantes, ofertas y mensajes institucionales. Sus identificadores, precios y
stocks son ficticios y no se pueden reutilizar como información comercial.
Cada perfil declara además la referencia aprobada con la que debe producirse la
muestra. El dataset automático conserva el lubricante sintético requerido por la
matriz. La muestra humana de `lubricentro-producto-limpio` usa un brief separado
para el filtro Wega FCI 1101C y una foto aportada por el usuario el 2026-08-07;
así la referencia no se mezcla con un producto distinto. El usuario confirmó
permiso del negocio para usar las marcas de los productos.

El snapshot de cada caso fija:

- identificadores de producto;
- precio visible o ausencia de precio;
- enunciados sustentados de stock;
- CTA exacto;
- vigencia, condición o disclaimer visible.

La evaluación automática compone la capa determinista sobre fondos sintéticos y
compara esos campos sin un juez probabilístico. También exige que el layout y el
formato conserven los cuatro casos aprobados de la baseline de composición:
fondo claro, oscuro, recargado y producto fuera de centro, con contraste mínimo
medido de 4,38:1.

Producto y stock permanecen ligados al snapshot factual aunque no formen parte
del texto visible de todos los layouts. La fidelidad del producto en los píxeles
del resultado real es un criterio humano y no se infiere desde la base
sintética.

## Rúbrica humana ciega

La muestra acordada contiene 12 resultados reales: `feed` e `historia` de cada
perfil. Los archivos se presentan como `A01` a `A12`; perfil, formato, categoría
y snapshot quedan en una clave separada que no se abre hasta terminar las
puntuaciones.

Cada criterio recibe un entero de 1 a 5:

| Criterio | Pregunta |
|---|---|
| Jerarquía visual | ¿La idea principal se entiende de inmediato? |
| Composición | ¿Sujeto, recorte y overlay conviven sin competir? |
| Fidelidad de producto | ¿Forma, accesorios, envase y referencias son fieles? |
| Coherencia de marca | ¿La pieza se reconoce como Aramayo sin deformaciones? |
| Relevancia de contexto | ¿Escena, oficio y perfil corresponden al brief? |
| Lectura móvil | ¿Texto, precio, CTA y vigencia se leen a tamaño real? |

Umbrales codificados:

- ningún criterio individual por debajo de 3;
- promedio de cada caso igual o mayor que 4;
- promedio de la muestra igual o mayor que 4,2;
- cero hallazgos críticos;
- revisión firmada por `business-owner` y `visual-reviewer`.

Son hallazgos críticos, entre otros: producto o dato comercial incorrecto,
texto ilegible, logo o marca deformados, anatomía o práctica insegura, patente o
persona reconocible, contenido prohibido o contradicción con la referencia. Un
hallazgo crítico bloquea el caso; no se promedia.

## Responsabilidades

- `business-owner`: confirma muestra, producto, datos comerciales, CTA,
  disclaimers y ausencia de afirmaciones no sustentadas. Tiene veto factual.
- `visual-reviewer`: puntúa los seis criterios, revisa la salida a tamaño móvil
  y registra defectos de marca, composición y seguridad. Tiene veto visual.
- el gate del dominio: valida que existan ambas responsabilidades, todos los
  casos de la muestra, puntuaciones completas y umbrales. El estado `approved`
  escrito a mano sin esa evidencia se rechaza como incompleto.

## Ejecución

La preevaluación local no usa red ni consume OpenAI:

```bash
pnpm image-quality:eval -- --write
```

Congela `apps/worker/src/evaluation/image-quality-evaluation-baseline.json`
solamente si los 18 casos automáticos pasan. Una corrida posterior sin
`--write` compara hashes de overlay y versiones contra esa baseline. El overlay
es estable entre plataformas; el PNG sintético no forma parte de su identidad.
Mientras la revisión humana esté pendiente, termina bloqueada con
`human-review-pending` por diseño.

La revisión ciega requiere 12 PNG o JPEG reales generados en staging. Cada
archivo se nombra con el `caseId` del dataset. No se aceptan placeholders
sintéticos como evidencia humana. Para generar las bases y componer el paquete
en una sola corrida:

```bash
NODE_ENV=staging node tools/run-with-env.mjs pnpm image-quality:eval -- \
  --generate-real \
  --product-reference=/ruta/a/la/foto-aprobada.jpeg \
  --approved-output-cost-usd=0.50
```

El monto confirma sólo el costo de salida de referencia que se muestra antes de
contactar al proveedor. Una edición suma tokens de entrada de la imagen; el
manifiesto registra el costo liquidado informado. Para recomponer un lote real
ya existente:

```bash
pnpm image-quality:eval -- --review-bundle \
  --review-assets=/ruta/al/lote-real
```

La salida ignorada por Git queda en `output/image-quality-review/`. El reporte
automático de cada corrida queda en `output/image-quality-evaluation/report.json`.
No se deben versionar binarios, secretos, prompts completos ni referencias con
datos personales.

La primera corrida real se ejecutó el 2026-08-07: generó 12/12 bases, conservó
12 request ID y liquidó USD 0,657. La inspección preliminar detectó un hallazgo
crítico en `A03` y `A04`: la referencia Wega perdió marca y código, y `A04`
incorporó un filtro blanco genérico. La muestra queda como evidencia de rechazo;
no habilita el gate y su hoja humana todavía no está firmada.

## Invalidez y promoción

La baseline queda ligada a dataset, prompt, perfil, modelo y versión de
composición. Cambiar cualquiera invalida la puerta. Un cambio silencioso que
conserve las versiones también se detecta mediante el hash de la capa
determinista de cada caso. Para promover un cambio se debe volver a ejecutar la evaluación real
y repetir la revisión ciega; copiar el estado humano anterior no es válido.

La API oficial de OpenAI permite graders con imágenes de entrada y combinar
varios graders. Se verificó el 2026-08-07 en
[Graders](https://developers.openai.com/api/reference/resources/graders). Esta
plataforma no los usa como autoridad de hechos comerciales: pueden ser una señal
auxiliar futura, pero no sustituyen la comparación determinista ni los dos roles
humanos.
