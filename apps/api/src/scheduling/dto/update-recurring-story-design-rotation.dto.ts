import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsIn,
  IsInt,
  Min,
} from "class-validator";

export class UpdateRecurringStoryDesignRotationDto {
  @ArrayMaxSize(7)
  @ArrayMinSize(7)
  @IsArray()
  @IsIn(["cartel", "horario", "locales"], { each: true })
  designRotation!: ("cartel" | "horario" | "locales")[];

  @IsInt()
  @Min(1)
  expectedVersion!: number;
}
