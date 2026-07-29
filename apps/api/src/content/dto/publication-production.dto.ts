import { Type } from "class-transformer";
import { IsInt, Min } from "class-validator";

export class PublicationVersionCommandDto {
  @IsInt()
  @Min(1)
  @Type(() => Number)
  expectedVersion!: number;
}
