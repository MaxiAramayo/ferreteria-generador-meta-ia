# Recursos IA de la muestra técnica

- Fecha: 2026-08-11
- Herramienta: skill `imagegen`, modo built-in
- Modelo: no expuesto por la herramienta built-in
- Estado: muestra interna, no publicable
- Referencias: fotos propias de conectores de riego y capturas visuales
  aportadas por el usuario como orientación de composición

## Recursos reemplazados

`conectores-variantes-ia-v1.png` y `conector-aplicacion-ia-v1.png` quedan como
trazabilidad de la primera iteración, pero fueron rechazados visual y
técnicamente. En particular, la escena de aplicación representaba de manera
ambigua una unión terminada y no debe reutilizarse.

## `conectores-tres-medidas-ia-v2.png`

Base 4:5 para una ficha de variantes. Presenta exactamente tres conectores T
negros de una misma familia, ordenados de menor a mayor sobre un mostrador
genérico. El producto ocupa el centro de la escena y la fotografía completa se
conserva como superficie principal de la composición. No contiene texto, marca, medida ni
afirmación de stock.

Prompt resumido: fotografía comercial vertical 4:5, exactamente tres conectores
T de espiga negros y estructuralmente idénticos, pequeños/medianos/grandes,
erguidos sobre mostrador grafito de ferretería, luz cálida lateral y fondo de
estanterías desenfocado; los tres productos completos y separados, espacio
negativo superior, sin texto, logos, medidas, flechas, manos, packaging ni
estética CGI.

## `conector-preencastre-ia-v2.png`

Base 4:5 para una guía de preencastre. Presenta el conector y tres bocas de
manguera completamente separados. Las tres espigas permanecen visibles y una
boca queda alineada con una de ellas, sin inventar una unión terminada. La cinta
métrica funciona solamente como contexto de mostrador.

Prompt resumido: fotografía comercial vertical 4:5 sobre mostrador grafito,
conector T negro de triple espiga en el centro y tres tramos de manguera negros
separados alrededor; cada boca abierta orientada hacia una espiga pero sin
tocarla, todas las estrías visibles, espacio negativo superior izquierdo, cinta
métrica arriba a la derecha, sin unión instalada, manguitos, roscas, texto,
logos, flechas, manos ni estética CGI.

## Alcance factual de la muestra

La ficha de variantes usa dos rótulos recuperados de Odoo el
2026-08-12T23:18:41.000Z mediante una búsqueda `tee`: `ESPIGA TEE 1/2` (SKU
`1670`, `odoo-product-7915`) y `ESPIGA TEE 3/4 POLIETILENO` (SKU `1671`,
`odoo-product-7916`). La evidencia conservada en el fixture es
`odoo:product.product:search`, request ID
`fe794c7e-f168-49ea-a025-6e446b6389e4`, con alcance limitado a identidad y
medida de producto.

La imagen continúa siendo una representación de categoría: los conectores que
muestra no son evidencia de la apariencia exacta de esos SKU. Los prototipos
continúan con `publishable: false`; la consulta no acreditó precio, stock,
compatibilidad ni instalación exacta. Antes de publicar, el caso de uso debe
recuperar un snapshot vigente mediante el adaptador comercial de la plataforma.

Ambos activos deben conservar el disclaimer `IMAGEN ILUSTRATIVA` y, por sí
solos, no pueden usarse para afirmar SKU, medida, marca, disponibilidad o
instalación exacta.
