import { IsIn, IsOptional } from 'class-validator'

// A closed list rather than a free string: the value lands inside the Content-Disposition header
// that StorageService signs, so anything accepted here is something our credentials vouch for.
// Absent means attachment, which is what every caller got before this existed.
export class DownloadUrlQueryDto {
  @IsOptional()
  @IsIn(['inline', 'attachment'])
  disposition?: 'inline' | 'attachment'
}
