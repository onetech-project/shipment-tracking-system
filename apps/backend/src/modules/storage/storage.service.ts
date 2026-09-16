import { Injectable } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'

const UPLOAD_URL_TTL_SECONDS = 300
const DOWNLOAD_URL_TTL_SECONDS = 120

// The exported surface is deliberately narrow: the fleet module asks for a URL and gets one, and
// never learns that S3 is behind it. Swapping MinIO for real S3 is then an env change.
@Injectable()
export class StorageService {
  private readonly client: S3Client
  private readonly bucket: string

  constructor(private readonly config: ConfigService) {
    this.bucket = this.config.get<string>('S3_BUCKET') ?? 'esp-fleet'
    // Signed against the endpoint the BROWSER will call, not the one the backend uses to reach
    // MinIO over the compose network. Signing for 'minio:9000' and handing that URL to a browser
    // produces SignatureDoesNotMatch even though the credentials are right.
    this.client = new S3Client({
      region: this.config.get<string>('S3_REGION') ?? 'us-east-1',
      endpoint:
        this.config.get<string>('S3_PUBLIC_ENDPOINT') ?? this.config.get<string>('S3_ENDPOINT'),
      forcePathStyle: this.config.get<string>('S3_FORCE_PATH_STYLE') !== 'false',
      credentials: {
        accessKeyId: this.config.get<string>('S3_ACCESS_KEY') ?? '',
        secretAccessKey: this.config.get<string>('S3_SECRET_KEY') ?? '',
      },
    })
  }

  // ContentType and ContentLength are part of the signature, so the browser cannot upload a
  // different type or a larger file than the intent was granted for — the size limit is enforced
  // by MinIO itself rather than by our trust in the client.
  async createUploadUrl(key: string, mime: string, maxBytes: number): Promise<string> {
    const command = new PutObjectCommand({
      Bucket: this.bucket,
      Key: key,
      ContentType: mime,
      ContentLength: maxBytes,
    })
    return getSignedUrl(this.client, command, { expiresIn: UPLOAD_URL_TTL_SECONDS })
  }

  async createDownloadUrl(key: string, filename: string): Promise<string> {
    const command = new GetObjectCommand({
      Bucket: this.bucket,
      Key: key,
      // Quotes escaped so a filename containing one cannot terminate the header value early.
      ResponseContentDisposition: `attachment; filename="${filename.replace(/"/g, '')}"`,
    })
    return getSignedUrl(this.client, command, { expiresIn: DOWNLOAD_URL_TTL_SECONDS })
  }

  // null means "no such object", which is the answer confirm() acts on. Any other failure is a
  // real fault and is rethrown: treating an AccessDenied as "missing" would let a confirm quietly
  // succeed against a bucket we cannot actually read.
  async statObject(key: string): Promise<{ size: number; mime: string } | null> {
    try {
      const out = await this.client.send(new HeadObjectCommand({ Bucket: this.bucket, Key: key }))
      return { size: Number(out.ContentLength ?? 0), mime: out.ContentType ?? '' }
    } catch (err: unknown) {
      const name = (err as { name?: string })?.name
      if (name === 'NotFound' || name === 'NoSuchKey') return null
      throw err
    }
  }

  async deleteObject(key: string): Promise<void> {
    await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key }))
  }
}
