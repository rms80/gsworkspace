import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  ListObjectsV2Command,
} from '@aws-sdk/client-s3'

const s3Client = new S3Client({
  region: process.env.AWS_REGION || 'us-east-1',
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID || '',
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || '',
  },
})

const BUCKET_NAME = process.env.S3_BUCKET_NAME || ''

export async function saveToS3(
  key: string,
  data: string | Buffer,
  contentType = 'application/json'
): Promise<void> {
  await s3Client.send(
    new PutObjectCommand({
      Bucket: BUCKET_NAME,
      Key: key,
      Body: data,
      ContentType: contentType,
    })
  )
}

export async function loadFromS3(key: string): Promise<string | null> {
  try {
    const response = await s3Client.send(
      new GetObjectCommand({
        Bucket: BUCKET_NAME,
        Key: key,
      })
    )
    return await response.Body?.transformToString() ?? null
  } catch (error: unknown) {
    if ((error as { name?: string }).name === 'NoSuchKey') {
      return null
    }
    throw error
  }
}

export async function listFromS3(prefix: string): Promise<string[]> {
  const response = await s3Client.send(
    new ListObjectsV2Command({
      Bucket: BUCKET_NAME,
      Prefix: prefix,
    })
  )
  return response.Contents?.map((item) => item.Key || '').filter(Boolean) || []
}
