/**
 * Puente entre la entidad validada y el contrato público.
 *
 * `@aramayo/domain` no depende de `@aramayo/contracts` —hacerlo arrastraría el
 * motor de diseño y React a un paquete de reglas puras—, así que ambas
 * declaraciones existen por separado. El worker es el único proceso que ve las
 * dos, y acá se comprueba en tiempo de compilación que siguen siendo la misma
 * forma. Si alguien agrega un campo de un lado y no del otro, el typecheck
 * falla en lugar de dejar que se publique un brief incompleto.
 */

import type { ContentBrief as ContractContentBrief } from "@aramayo/contracts";
import type { ContentBrief as DomainContentBrief } from "@aramayo/domain";

type AssertAssignable<Target, Source extends Target> = Source;

type DomainSatisfiesContract = AssertAssignable<
  ContractContentBrief,
  DomainContentBrief
>;
type ContractSatisfiesDomain = AssertAssignable<
  DomainContentBrief,
  ContractContentBrief
>;

/**
 * Presenta la entidad validada como contrato público. Es identidad en runtime:
 * la equivalencia ya quedó probada por los tipos de arriba.
 */
export function toContentBriefContract(
  brief: DomainSatisfiesContract,
): ContractSatisfiesDomain {
  return brief;
}
