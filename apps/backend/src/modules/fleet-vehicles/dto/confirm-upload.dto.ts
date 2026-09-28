import { Type } from 'class-transformer'
import { IsIn, IsInt, IsNotEmpty, IsString, Max, MaxLength, Min } from 'class-validator'
import { ALLOWED_MIME_TYPES, MAX_UPLOAD_BYTES } from '../../storage/storage.constants'

// Shaped like the intent because the service compares the two against what MinIO actually holds:
// a confirm whose numbers disagree with the object is refused (spec §4.2 step 3).
export class ConfirmUploadDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  storageKey: string

  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  originalName: string

  @IsIn(ALLOWED_MIME_TYPES as string[])
  mimeType: string

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(MAX_UPLOAD_BYTES)
  sizeBytes: number
}
