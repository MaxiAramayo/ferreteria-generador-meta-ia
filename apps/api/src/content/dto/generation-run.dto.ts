import {
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

export class RequestGenerationEditDto {
  @IsIn([...generationEditKinds])
  kind!: string;

  @IsString()
  @MinLength(generationRunLimits.editInstructionMinimum)
  @MaxLength(generationRunLimits.editInstructionMaximum)
  instruction!: string;

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
}

export class SelectGenerationVariantDto {
  @IsUUID()
  variantId!: string;

  @Type(() => Number)
  @IsInt()
  @Min(0)
  expectedSelectionVersion!: number;
}
