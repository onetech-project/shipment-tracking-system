import { Transform } from 'class-transformer'
import { IsInt, IsNotEmpty, IsObject, IsOptional, IsString, MaxLength, Min } from 'class-validator'

// Trim before validation so a whitespace-only name (e.g. '   ') fails @IsNotEmpty() instead of
// passing it and only being caught (or silently swallowed, on update) once the service trims it.
const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value)

// The payload is the frontend engine's ScenarioPayload; it is validated only as an object here
// (and for size in the service). Per-field decorators would duplicate a shape the backend never
// reads and would turn every engine change into a two-app deploy.
export class CreateScenarioDto {
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  name: string

  @IsOptional()
  @IsString()
  description?: string | null

  @IsObject()
  payload: Record<string, unknown>
}

export class UpdateScenarioDto {
  // The revision the client loaded. A mismatch means someone saved in between → 409.
  @IsInt()
  @Min(1)
  revision: number

  @IsOptional()
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  name?: string

  // null clears, absent leaves unchanged.
  @IsOptional()
  @IsString()
  description?: string | null

  @IsOptional()
  @IsObject()
  payload?: Record<string, unknown>
}
