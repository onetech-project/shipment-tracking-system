import { IsArray, IsString } from 'class-validator'

export class AttachTosDto {
  /** Full desired set of TO numbers for this Koli. May be empty to detach all. */
  @IsArray()
  @IsString({ each: true })
  toNumbers: string[]
}
