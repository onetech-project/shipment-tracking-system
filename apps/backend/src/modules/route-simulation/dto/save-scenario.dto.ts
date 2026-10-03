import { IsInt, IsNotEmpty, IsObject, IsOptional, IsString, MaxLength, Min } from 'class-validator'

// The payload is the frontend engine's ScenarioPayload; it is validated only as an object here
// (and for size in the service). Per-field decorators would duplicate a shape the backend never
// reads and would turn every engine change into a two-app deploy.
export class CreateScenarioDto {
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
