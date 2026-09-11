import { env } from "$env/dynamic/private";

const AWS_ACCESS_KEY_ID = env.AWS_ACCESS_KEY_ID;
const AWS_SECRET_ACCESS_KEY = env.AWS_SECRET_ACCESS_KEY;
const AWS_REGION = env.AWS_REGION || "us-east-1";
const S3_BUCKET = env.AWS_S3_BUCKET || "ether-yamls";

interface S3Config {
  domain: string;
  filename: string;
  content: string;
  contentType?: string;
}

interface S3Object {
  key: string;
  lastModified: string;
  versionId?: string;
  size: number;
}

// AWS Signature V4 signing for S3
async function signRequest(
  method: string,
  path: string,
  payload: string | null,
  headers: Record<string, string> = {},
): Promise<Record<string, string>> {
  const now = new Date();
  const dateStamp = now
    .toISOString()
    .replace(/[:-]|\.\d{3}/g, "")
    .slice(0, 8);
  const timeStamp = now.toISOString().replace(/[:-]|\.\d{3}/g, "");

  const credentialScope = `${dateStamp}/${AWS_REGION}/s3/aws4_request`;

  // Canonical request
  const canonicalHeaders = Object.entries({
    host: `${S3_BUCKET}.s3.${AWS_REGION}.amazonaws.com`,
    "x-amz-date": timeStamp,
    "x-amz-content-sha256": payload
      ? await sha256(payload)
      : "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
    ...headers,
  })
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k.toLowerCase()}:${v.trim()}`)
    .join("\n");

  const signedHeaders = Object.keys({
    host: true,
    "x-amz-date": true,
    "x-amz-content-sha256": true,
    ...headers,
  })
    .sort()
    .map((k) => k.toLowerCase())
    .join(";");

  const payloadHash = payload
    ? await sha256(payload)
    : "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855";

  const canonicalRequest = [
    method,
    path,
    "",
    canonicalHeaders + "\n",
    signedHeaders,
    payloadHash,
  ].join("\n");

  // String to sign
  const stringToSign = [
    "AWS4-HMAC-SHA256",
    timeStamp,
    credentialScope,
    await sha256(canonicalRequest),
  ].join("\n");

  // Calculate signature
  const signingKey = await getSigningKey(
    AWS_SECRET_ACCESS_KEY!,
    dateStamp,
    AWS_REGION,
  );
  const signature = await hmacHex(signingKey, stringToSign);

  // Authorization header
  const authorization = `AWS4-HMAC-SHA256 Credential=${AWS_ACCESS_KEY_ID}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;

  return {
    Authorization: authorization,
    "X-Amz-Date": timeStamp,
    "X-Amz-Content-SHA256": payloadHash,
    Host: `${S3_BUCKET}.s3.${AWS_REGION}.amazonaws.com`,
    ...headers,
  };
}

async function sha256(message: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(message);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function getSigningKey(
  secretKey: string,
  dateStamp: string,
  region: string,
): Promise<ArrayBuffer> {
  const encoder = new TextEncoder();
  const secretKeyBytes = encoder.encode(`AWS4${secretKey}`);
  const kDate = await hmac(secretKeyBytes.buffer, dateStamp);
  const kRegion = await hmac(kDate, region);
  const kService = await hmac(kRegion, "s3");
  const kSigning = await hmac(kService, "aws4_request");
  return kSigning;
}

async function hmac(key: ArrayBuffer, message: string): Promise<ArrayBuffer> {
  const encoder = new TextEncoder();
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    key,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign(
    "HMAC",
    cryptoKey,
    encoder.encode(message),
  );
  return signature;
}

async function hmacHex(key: ArrayBuffer, message: string): Promise<string> {
  const signature = await hmac(key, message);
  const array = Array.from(new Uint8Array(signature));
  return array.map((b) => b.toString(16).padStart(2, "0")).join("");
}

export async function uploadConfig(config: S3Config): Promise<string | null> {
  if (!AWS_ACCESS_KEY_ID || !AWS_SECRET_ACCESS_KEY) {
    throw new Error("AWS credentials not configured");
  }

  const key = `tenants/${config.domain}/${config.filename}`;
  const contentType = config.contentType || "application/yaml";

  const headers = await signRequest("PUT", `/${key}`, config.content, {
    "Content-Type": contentType,
  });

  const response = await fetch(
    `https://${S3_BUCKET}.s3.${AWS_REGION}.amazonaws.com/${key}`,
    {
      method: "PUT",
      headers: {
        ...headers,
        "Content-Type": contentType,
      },
      body: config.content,
    },
  );

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`S3 upload error: ${error}`);
  }

  // Return the version ID from response headers
  return response.headers.get("x-amz-version-id") || null;
}

export async function downloadConfig(
  domain: string,
  filename: string,
  versionId?: string,
): Promise<{ content: string; versionId: string | null } | null> {
  if (!AWS_ACCESS_KEY_ID || !AWS_SECRET_ACCESS_KEY) {
    throw new Error("AWS credentials not configured");
  }

  let key = `tenants/${domain}/${filename}`;
  if (versionId) {
    key += `?versionId=${versionId}`;
  }

  const headers = await signRequest("GET", `/${key}`, null);

  const response = await fetch(
    `https://${S3_BUCKET}.s3.${AWS_REGION}.amazonaws.com/${key}`,
    {
      headers,
    },
  );

  if (response.status === 404) {
    return null;
  }

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`S3 download error: ${error}`);
  }

  const content = await response.text();
  const returnedVersionId = response.headers.get("x-amz-version-id");

  return {
    content,
    versionId: returnedVersionId,
  };
}

export async function listTenantConfigs(domain: string): Promise<S3Object[]> {
  if (!AWS_ACCESS_KEY_ID || !AWS_SECRET_ACCESS_KEY) {
    throw new Error("AWS credentials not configured");
  }

  const prefix = `tenants/${domain}/`;
  const query = `?list-type=2&prefix=${encodeURIComponent(prefix)}`;

  const headers = await signRequest("GET", `/${query}`, null);

  const response = await fetch(
    `https://${S3_BUCKET}.s3.${AWS_REGION}.amazonaws.com/${query}`,
    {
      headers,
    },
  );

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`S3 list error: ${error}`);
  }

  const xml = await response.text();

  // Parse XML response
  const objects: S3Object[] = [];
  const contentsMatch = xml.match(/<Contents>([\s\S]*?)<\/Contents>/g);

  if (contentsMatch) {
    for (const content of contentsMatch) {
      const keyMatch = content.match(/<Key>(.*?)<\/Key>/);
      const lastModifiedMatch = content.match(
        /<LastModified>(.*?)<\/LastModified>/,
      );
      const sizeMatch = content.match(/<Size>(\d+)<\/Size>/);

      if (keyMatch && lastModifiedMatch && sizeMatch) {
        objects.push({
          key: keyMatch[1],
          lastModified: lastModifiedMatch[1],
          size: parseInt(sizeMatch[1]),
        });
      }
    }
  }

  return objects;
}

export async function listConfigVersions(
  domain: string,
  filename: string,
): Promise<S3Object[]> {
  if (!AWS_ACCESS_KEY_ID || !AWS_SECRET_ACCESS_KEY) {
    throw new Error("AWS credentials not configured");
  }

  const key = `tenants/${domain}/${filename}`;
  const query = `?versions&prefix=${encodeURIComponent(key)}`;

  const headers = await signRequest("GET", `/${query}`, null);

  const response = await fetch(
    `https://${S3_BUCKET}.s3.${AWS_REGION}.amazonaws.com/${query}`,
    {
      headers,
    },
  );

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`S3 list versions error: ${error}`);
  }

  const xml = await response.text();

  // Parse XML response
  const objects: S3Object[] = [];
  const versionMatch = xml.match(/<Version>([\s\S]*?)<\/Version>/g);

  if (versionMatch) {
    for (const version of versionMatch) {
      const keyMatch = version.match(/<Key>(.*?)<\/Key>/);
      const versionIdMatch = version.match(/<VersionId>(.*?)<\/VersionId>/);
      const lastModifiedMatch = version.match(
        /<LastModified>(.*?)<\/LastModified>/,
      );
      const sizeMatch = version.match(/<Size>(\d+)<\/Size>/);

      if (keyMatch && versionIdMatch && lastModifiedMatch && sizeMatch) {
        objects.push({
          key: keyMatch[1],
          versionId: versionIdMatch[1],
          lastModified: lastModifiedMatch[1],
          size: parseInt(sizeMatch[1]),
        });
      }
    }
  }

  return objects;
}

export async function deleteConfig(
  domain: string,
  filename: string,
  versionId?: string,
): Promise<boolean> {
  if (!AWS_ACCESS_KEY_ID || !AWS_SECRET_ACCESS_KEY) {
    throw new Error("AWS credentials not configured");
  }

  let key = `tenants/${domain}/${filename}`;
  if (versionId) {
    key += `?versionId=${versionId}`;
  }

  const headers = await signRequest("DELETE", `/${key}`, null);

  const response = await fetch(
    `https://${S3_BUCKET}.s3.${AWS_REGION}.amazonaws.com/${key}`,
    {
      method: "DELETE",
      headers,
    },
  );

  return response.ok || response.status === 204;
}

export function generateS3Key(domain: string, filename: string): string {
  return `tenants/${domain}/${filename}`;
}

export function getS3Url(domain: string, filename: string): string {
  return `s3://${S3_BUCKET}/tenants/${domain}/${filename}`;
}
