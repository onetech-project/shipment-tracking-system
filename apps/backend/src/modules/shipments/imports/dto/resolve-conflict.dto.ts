import { Type } from 'class-transformer';
import {
  IsArray,
  IsEnum,
  IsUUID,
  ValidateNested,
  ArrayMinSize,
} from 'class-validator';

export enum ConflictAction {
  OVERWRITE = 'overwrite',
  SKIP = 'skip',
}

export class ConflictDecisionDto {
  @IsUUID()
  errorId: string;

  @IsEnum(ConflictAction)
  action: ConflictAction;
}

export class ResolveConflictDto {
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => ConflictDecisionDto)
  decisions: ConflictDecisionDto[];
}
