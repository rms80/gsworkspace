import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  ListObjectsV2Command,
} from '@aws-sdk/client-s3'
import dotenv from 'dotenv'

// Ensure env is loaded (may be called before index.ts loads it)
dotenv.config()

const BUCKET_NAME = process.env.S3_BUCKET_NAME || ''
const REGION = process.env.AWS_REGION || 'us-east-1'

const hasCredentials =
  process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY

// For authenticated requests, use the SDK
const s3Client = hasCredentials
  ? new S3Client({
      region: REGION,
      credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
      },
    })
  : null

// Build the S3 URL for direct HTTP access
function getS3Url(key: string): string {
  return `https://${BUCKET_NAME}.s3.${REGION}.amazonaws.com/${key}`
}

// Get public URL for an object
export function getPublicUrl(key: string): string {
  return getS3Url(key)
}

export async function saveToS3(
  key: string,
  data: string | Buffer,
  contentType = 'application/json'
): Promise<void> {
  if (s3Client) {
    await s3Client.send(
      new PutObjectCommand({
        Bucket: BUCKET_NAME,
        Key: key,
        Body: data,
        ContentType: contentType,
      })
    )
  } else {
    // Use direct HTTP PUT for public bucket
    const response = await fetch(getS3Url(key), {
      method: 'PUT',
      body: data,
      headers: {
        'Content-Type': contentType,
      },
    })
    if (!response.ok) {
      throw new Error(`S3 PUT failed: ${response.status} ${response.statusText}`)
    }
  }
}

export async function loadFromS3(key: string): Promise<string | null> {
  if (s3Client) {
    try {
      const response = await s3Client.send(
        new GetObjectCommand({
          Bucket: BUCKET_NAME,
          Key: key,
        })
      )
      return (await response.Body?.transformToString()) ?? null
    } catch (error: unknown) {
      if ((error as { name?: string }).name === 'NoSuchKey') {
        return null
      }
      throw error
    }
  } else {
    // Use direct HTTP GET for public bucket
    const response = await fetch(getS3Url(key))
    if (response.status === 404 || response.status === 403) {
      return null
    }
    if (!response.ok) {
      throw new Error(`S3 GET failed: ${response.status} ${response.statusText}`)
    }
    return await response.text()
  }
}

export async function listFromS3(prefix: string): Promise<string[]> {
  if (s3Client) {
    const response = await s3Client.send(
      new ListObjectsV2Command({
        Bucket: BUCKET_NAME,
        Prefix: prefix,
      })
    )
    return response.Contents?.map((item) => item.Key || '').filter(Boolean) || []
  } else {
    // Use S3 REST API for listing (public bucket)
    const url = `https://${BUCKET_NAME}.s3.${REGION}.amazonaws.com/?list-type=2&prefix=${encodeURIComponent(prefix)}`
    const response = await fetch(url)
    if (!response.ok) {
      throw new Error(`S3 LIST failed: ${response.status} ${response.statusText}`)
    }
    const xml = await response.text()
    // Parse keys from XML response
    const keys: string[] = []
    const keyRegex = /<Key>([^<]+)<\/Key>/g
    let match
    while ((match = keyRegex.exec(xml)) !== null) {
      keys.push(match[1])
    }
    return keys
  }
}
