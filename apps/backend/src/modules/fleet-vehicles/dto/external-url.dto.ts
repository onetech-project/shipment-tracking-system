import { registerDecorator, IsNotEmpty, IsString, MaxLength, ValidationOptions } from 'class-validator'
import { isSafeExternalUrl } from '../fleet-files'

// A custom decorator rather than @IsUrl: the check that matters here is the scheme, and it must
// be the same parse the storage helper performs. Two different notions of "safe URL" is how one
// of them ends up wrong.
function IsHttpUrl(options?: ValidationOptions) {
  return function (object: object, propertyName: string) {
    registerDecorator({
      name: 'isHttpUrl',
      target: object.constructor,
      propertyName,
      options,
      validator: {
        validate: (value: unknown) => typeof value === 'string' && isSafeExternalUrl(value),
        defaultMessage: () => 'url must be an http or https link',
      },
    })
  }
}

export class ExternalUrlDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(2048)
  @IsHttpUrl()
  url: string
}
