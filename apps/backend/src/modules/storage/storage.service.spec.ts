import { ConfigService } from '@nestjs/config'
import { StorageService } from './storage.service'

const getSignedUrl = jest.fn()
jest.mock('@aws-sdk/s3-request-presigner', () => ({
  getSignedUrl: (...args: unknown[]) => getSignedUrl(...args),
}))

const send = jest.fn()
// Named with the mock prefix because jest.mock factories are hoisted above imports and can only
// close over variables whose names begin with "mock"
const mockS3ClientCtor = jest.fn()
jest.mock('@aws-sdk/client-s3', () => ({
  S3Client: jest.fn().mockImplementation((...args: unknown[]) => {
    mockS3ClientCtor(...args)
    return { send: (...a: unknown[]) => send(...a) }
  }),
  PutObjectCommand: jest.fn().mockImplementation((input) => ({ __cmd: 'put', input })),
  GetObjectCommand: jest.fn().mockImplementation((input) => ({ __cmd: 'get', input })),
  HeadObjectCommand: jest.fn().mockImplementation((input) => ({ __cmd: 'head', input })),
  DeleteObjectCommand: jest.fn().mockImplementation((input) => ({ __cmd: 'delete', input })),
}))

function build(): StorageService {
  const config = {
    get: (key: string) =>
      ({
        S3_ENDPOINT: 'http://minio:9000',
        S3_PUBLIC_ENDPOINT: 'http://localhost:9000',
        S3_REGION: 'us-east-1',
        S3_ACCESS_KEY: 'minioadmin',
        S3_SECRET_KEY: 'minioadmin',
        S3_BUCKET: 'esp-fleet',
        S3_FORCE_PATH_STYLE: 'true',
      })[key],
  } as unknown as ConfigService
  return new StorageService(config)
}

beforeEach(() => {
  getSignedUrl.mockReset()
  send.mockReset()
  mockS3ClientCtor.mockReset()
  getSignedUrl.mockResolvedValue('https://signed.example/url')
})

describe('StorageService', () => {
  // A presigned URL must be signed for the host the BROWSER will call, not the host the backend
  // reaches MinIO on over the compose network - swapping the ?? operand order (or the
  // forcePathStyle/credentials wiring) signs for the wrong host and MinIO answers every upload
  // with SignatureDoesNotMatch even though the credentials themselves are correct
  it('constructs the S3 client against the browser-facing endpoint', () => {
    build()

    expect(mockS3ClientCtor).toHaveBeenCalledWith(
      expect.objectContaining({
        endpoint: 'http://localhost:9000',
        forcePathStyle: true,
        credentials: {
          accessKeyId: 'minioadmin',
          secretAccessKey: 'minioadmin',
        },
      })
    )
  })

  // Since aws-sdk-js-v3 v3.729 the default (WHEN_SUPPORTED) signs an x-amz-checksum-crc32 of the
  // EMPTY body into every presigned PutObject, because there is no body at signing time. A store
  // that validates that parameter rejects every real upload, and the error reads like a CORS or
  // signature fault rather than a checksum one. Mocked tests cannot see it, so the construction
  // option is pinned here instead.
  it('asks the SDK not to precompute a checksum it cannot know', () => {
    build()

    expect(mockS3ClientCtor).toHaveBeenCalledWith(
      expect.objectContaining({ requestChecksumCalculation: 'WHEN_REQUIRED' }),
    )
  })

  it('signs a PUT that pins the content type and length', async () => {
    const service = build()
    await service.createUploadUrl('fleet/v1/stnk/abc.pdf', 'application/pdf', 1234)

    const [, command, options] = getSignedUrl.mock.calls[0]
    expect(command.input).toMatchObject({
      Bucket: 'esp-fleet',
      Key: 'fleet/v1/stnk/abc.pdf',
      ContentType: 'application/pdf',
      ContentLength: 1234,
    })
    // Five minutes: long enough for a slow connection, short enough that a leaked URL is not a
    // standing write grant on the bucket.
    expect(options).toMatchObject({ expiresIn: 300 })
  })

  it('signs a GET that names the file for the download', async () => {
    const service = build()
    await service.createDownloadUrl('fleet/v1/stnk/abc.pdf', 'STNK B 9114 KYZ.pdf')

    const [, command, options] = getSignedUrl.mock.calls[0]
    expect(command.input.ResponseContentDisposition).toContain('STNK B 9114 KYZ.pdf')
    expect(options).toMatchObject({ expiresIn: 120 })
  })

  // The default is the security-relevant half of this pair: a caller that says nothing must not
  // start serving objects inline because some other caller wanted a preview.
  it('defaults to an attachment when no disposition is asked for', async () => {
    const service = build()
    await service.createDownloadUrl('fleet/v1/stnk/abc.pdf', 'stnk.pdf')

    const [, command] = getSignedUrl.mock.calls[0]
    expect(command.input.ResponseContentDisposition).toMatch(/^attachment;/)
  })

  it('signs a GET the browser will render when asked for inline', async () => {
    const service = build()
    await service.createDownloadUrl('fleet/v1/stnk/abc.pdf', 'stnk.pdf', 'inline')

    const [, command] = getSignedUrl.mock.calls[0]
    expect(command.input.ResponseContentDisposition).toBe('inline; filename="stnk.pdf"')
  })

  it('reports an object size and type', async () => {
    send.mockResolvedValue({ ContentLength: 2048, ContentType: 'image/png' })
    const service = build()
    await expect(service.statObject('fleet/v1/stnk/abc.png')).resolves.toEqual({
      size: 2048,
      mime: 'image/png',
    })
  })

  // A missing object is an ordinary answer here, not a fault: confirm() asks precisely because it
  // does not trust the client's claim that an upload happened.
  it('answers null when the object is not there', async () => {
    send.mockRejectedValue(Object.assign(new Error('not found'), { name: 'NotFound' }))
    const service = build()
    await expect(service.statObject('missing')).resolves.toBeNull()
  })

  it('rethrows a stat failure that is not a missing object', async () => {
    send.mockRejectedValue(Object.assign(new Error('boom'), { name: 'AccessDenied' }))
    const service = build()
    await expect(service.statObject('any')).rejects.toThrow('boom')
  })

  it('deletes by key', async () => {
    send.mockResolvedValue({})
    const service = build()
    await service.deleteObject('fleet/v1/stnk/abc.pdf')
    expect(send.mock.calls[0][0].input).toMatchObject({
      Bucket: 'esp-fleet',
      Key: 'fleet/v1/stnk/abc.pdf',
    })
  })
})
