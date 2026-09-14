import {
  contentBriefLimits,
  frameLayoutIds,
  generationEditKinds,
  generationRunLimits,
  visualFormatIds,
  visualSubjectKinds,
} from "@aramayo/domain";
import {
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  Min,
  MaxLength,
  MinLength,
  ValidateIf,
} from "class-validator";
import { Transform, Type } from "class-transformer";

/**
 * Pedido del lote.
 *
 * No nombra perfil, prompt ni versión: los elige el worker al ejecutar y los
 * anota al cerrar. La API no puede conocerlos sin acoplarse a la versión que hoy
 * corre del otro lado del outbox. Tampoco nombra organización ni autor: salen de
 * la sesión.
 */
export class RequestGenerationRunDto {
  /** Ejecución de brief que da el contenido a ilustrar. */
  @IsUUID()
  contentBriefRunId!: string;

  /**
   * La lista sale del dominio y no se repite acá: duplicarla haría que agregar
   * un formato aprobado lo dejara rechazado en el borde sin que nada avise.
   */
  @IsOptional()
  @IsIn([...visualFormatIds])
  format?: string;

  /**
   * Cuántas variantes pedir. Cada una es una llamada facturada, así que el
   * tope vive también en el dominio y no sólo acá.
   */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(generationRunLimits.variantsMinimum)
  @Max(generationRunLimits.variantsMaximum)
  variants?: number;

  /**
   * Si el sujeto tiene marca que respetar. Por defecto `branded`, que es el
   * criterio conservador: exige foto real en lugar de dejar que el modelo
   * dibuje una etiqueta.
   */
  @IsOptional()
  @IsIn([...visualSubjectKinds])
  subjectKind?: string;
}

export class GenerationRunHistoryQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  limit?: number;

  /** `mine=true` restringe el historial a los lotes del propio editor. */
  @IsOptional()
  @Transform(({ value }) => value === "true" || value === true)
  @IsBoolean()
  mine?: boolean;

  @IsOptional()
  @IsUUID()
  contentBriefRunId?: string;

  @IsOptional()
  @IsUUID()
  lineageRootId?: string;
}

/**
 * Pedido de edición.
 *
 * `instruction` es lo que se le pide a un modelo, y por eso no aplica a
 * `kind: "composition"`: cambiar de marco y textos no genera nada, así que en
 * su lugar lleva el marco elegido y el copy completo. Las dos formas
 * comparten `kind` y `parentVariantId`; el resto se valida sólo cuando
 * corresponde a la forma elegida.
 */
export class RequestGenerationEditDto {
  @IsIn([...generationEditKinds])
  kind!: string;

  @ValidateIf((dto: RequestGenerationEditDto) => dto.kind !== "composition")
  @IsString()
  @MinLength(generationRunLimits.editInstructionMinimum)
  @MaxLength(generationRunLimits.editInstructionMaximum)
  instruction?: string;

  @IsUUID()
  parentVariantId!: string;

  @IsOptional()
  @IsUUID()
  contentBriefRunId?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(generationRunLimits.variantsMinimum)
  @Max(generationRunLimits.variantsMaximum)
  variants?: number;

  /** Sólo para `kind: "composition"`: uno de los nueve marcos aprobados. */
  @ValidateIf((dto: RequestGenerationEditDto) => dto.kind === "composition")
  @IsIn([...frameLayoutIds])
  layout?: string;

  @ValidateIf((dto: RequestGenerationEditDto) => dto.kind === "composition")
  @IsString()
  @MinLength(contentBriefLimits.titleMinimum)
  @MaxLength(contentBriefLimits.titleMaximum)
  title?: string;

  @ValidateIf(
    (dto: RequestGenerationEditDto) =>
      dto.kind === "composition" && dto.subtitle !== null,
  )
  @IsOptional()
  @IsString()
  @MinLength(contentBriefLimits.subtitleMinimum)
  @MaxLength(contentBriefLimits.subtitleMaximum)
  subtitle?: string | null;

  @ValidateIf((dto: RequestGenerationEditDto) => dto.kind === "composition")
  @IsString()
  @MinLength(contentBriefLimits.callToActionLabelMinimum)
  @MaxLength(contentBriefLimits.callToActionLabelMaximum)
  callToAction?: string;

  @ValidateIf(
    (dto: RequestGenerationEditDto) =>
      dto.kind === "composition" && dto.badge !== null,
  )
  @IsOptional()
  @IsString()
  @MinLength(generationRunLimits.compositionBadgeMinimum)
  @MaxLength(generationRunLimits.compositionBadgeMaximum)
  badge?: string | null;
}

export class SelectGenerationVariantDto {
  @IsUUID()
  variantId!: string;

  @Type(() => Number)
  @IsInt()
  @Min(0)
  expectedSelectionVersion!: number;
}
