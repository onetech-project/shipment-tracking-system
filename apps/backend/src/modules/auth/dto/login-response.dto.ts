import { ApiProperty } from '@nestjs/swagger'
import { AuthenticatedUser } from '../../../common/decorators/current-user.decorator'

export class LoginResponseDto {
  @ApiProperty({
    description: 'JWT access token. Send as `Authorization: Bearer <token>` on private endpoints.',
    example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
  })
  accessToken: string

  @ApiProperty({ description: 'The authenticated user profile and permissions.' })
  user: AuthenticatedUser
}
