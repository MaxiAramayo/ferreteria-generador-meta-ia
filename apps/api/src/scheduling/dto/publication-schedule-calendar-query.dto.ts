import { IsDateString } from "class-validator";

/** Ventana UTC acotada; cada evento conserva además su fecha civil y zona. */
export class PublicationScheduleCalendarQueryDto {
  @IsDateString()
  from!: string;

  @IsDateString()
  to!: string;
}
