# Online Deployment (S3 Storage)

This folder contains sample AWS policies for setting up secure S3 storage for gsworkspace.

## Overview

In online mode, gsworkspace stores scenes and media in an S3 bucket. This requires:
1. An S3 bucket
2. An IAM user with access keys
3. Proper policies for secure access

## Setup Steps

### 1. Create an S3 Bucket

1. Go to AWS S3 Console
2. Create a new bucket (e.g., `gsworkspace-data`)
3. Region: Choose one close to your users
4. **Block all public access**: Keep this ENABLED (default)
5. Create the bucket

### 2. Configure CORS

In the bucket settings, go to **Permissions > CORS** and add:

```json
[
  {
    "AllowedHeaders": ["*"],
    "AllowedMethods": ["GET", "PUT", "POST", "DELETE", "HEAD"],
    "AllowedOrigins": ["http://localhost:3000", "https://yourdomain.com"],
    "ExposeHeaders": ["ETag"]
  }
]
```

Replace `https://yourdomain.com` with your actual domain(s).

### 3. Apply Bucket Policy (Optional)

The file `s3-bucket-policy.json` enforces HTTPS-only access. To apply:

1. Edit the file and replace `YOUR-BUCKET-NAME` with your bucket name
2. Go to **Permissions > Bucket policy**
3. Paste the policy

### 4. Create an IAM User

1. Go to AWS IAM Console
2. Create a new user (e.g., `gsworkspace-backend`)
3. Select **Access key - Programmatic access**
4. Do NOT attach any AWS managed policies

### 5. Create and Attach IAM Policy

1. Go to **Policies > Create policy**
2. Switch to JSON tab
3. Paste the contents of `iam-user-policy.json` (replace `YOUR-BUCKET-NAME`)
4. Name it (e.g., `gsworkspace-s3-access`)
5. Attach this policy to your IAM user

### 6. Generate Access Keys

1. Go to the IAM user
2. **Security credentials > Create access key**
3. Choose "Application running outside AWS"
4. Save the Access Key ID and Secret Access Key securely

### 7. Configure Backend

In `backend/.env`:

```
AWS_ACCESS_KEY_ID=your-access-key-id
AWS_SECRET_ACCESS_KEY=your-secret-access-key
AWS_REGION=us-east-1
S3_BUCKET_NAME=gsworkspace-data
```

## Policy Files

| File | Purpose |
|------|---------|
| `s3-bucket-policy.json` | Bucket policy enforcing HTTPS-only access |
| `iam-user-policy.json` | IAM policy granting minimal required S3 permissions |

## Security Notes

- **Never commit credentials** to git
- **Rotate access keys** periodically
- The IAM policy uses least-privilege: only the permissions gsworkspace needs
- CORS restricts which domains can access the bucket from browsers
- The bucket policy denies non-HTTPS requests
