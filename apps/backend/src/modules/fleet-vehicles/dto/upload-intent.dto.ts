import { Type } from 'class-transformer'
import { IsIn, IsInt, IsNotEmpty, IsString, Matches, Max, MaxLength, Min } from 'class-validator'
import { ALLOWED_MIME_TYPES, MAX_UPLOAD_BYTES } from '../../storage/storage.constants'

// The declared size is what the presigned PUT is signed for, so an oversized file is refused by
// MinIO as well as here. Declaring it up front also means a 10 MB refusal costs one request
// rather than a full upload.
export class UploadIntentDto {
  @IsString()
  @IsNotEmpty()
  // @IsNotEmpty alone accepts an all-whitespace string (it only rejects ''). Whitespace-only is
  // not a filename either, so the check needs at least one non-whitespace character.
  @Matches(/\S/)
  @MaxLength(255)
  filename: string

  @IsIn(ALLOWED_MIME_TYPES as string[])
  mimeType: string

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(MAX_UPLOAD_BYTES)
  sizeBytes: number
}
