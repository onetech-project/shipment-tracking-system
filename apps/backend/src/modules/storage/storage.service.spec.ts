import { ConfigService } from '@nestjs/config'
import { StorageService } from './storage.service'

const getSignedUrl = jest.fn()
jest.mock('@aws-sdk/s3-request-presigner', () => ({
  getSignedUrl: (...args: unknown[]) => getSignedUrl(...args),
}))

const send = jest.fn()
jest.mock('@aws-sdk/client-s3', () => ({
  S3Client: jest.fn().mockImplementation(() => ({ send: (...a: unknown[]) => send(...a) })),
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
  getSignedUrl.mockResolvedValue('https://signed.example/url')
})

describe('StorageService', () => {
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
