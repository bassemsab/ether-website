import { exec } from "child_process";
import { promisify } from "util";
import crypto from "crypto";

const execAsync = promisify(exec);

export interface SmtpCredentials {
  host: string;
  port: number;
  security: "STARTTLS";
  username: string;
  password: string;
}

/**
 * Generates a strong random SMTP password.
 */
export function generateSmtpPassword(length = 16): string {
  const chars =
    "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*()";
  const bytes = crypto.randomBytes(length);
  let password = "";
  for (let i = 0; i < length; i++) {
    password += chars[bytes[i] % chars.length];
  }
  return password;
}

/**
 * Generates a DKIM RSA 2048 key pair in Node/Bun and provisions it on Maddy.
 */
export async function getOrCreateDkimRecord(
  domain: string,
  selector = "default",
): Promise<{ selector: string; txtRecord: string; publicKey: string } | null> {
  const cleanDomain = domain
    .toLowerCase()
    .trim()
    .replace(/^www\./, "");
  const dnsFileName = `/data/dkim_keys/${cleanDomain}_${selector}.dns`;
  const keyFileName = `/data/dkim_keys/${cleanDomain}_${selector}.key`;

  try {
    // 1. Check if DNS file already exists on Maddy pod
    const checkCmd = `kubectl -n mail-server exec deployment/maddy -- test -f "${dnsFileName}" && echo "EXISTS" || echo "NOT_FOUND"`;
    const { stdout: checkOut } = await execAsync(checkCmd);

    if (checkOut.trim().includes("EXISTS")) {
      const catCmd = `kubectl -n mail-server exec deployment/maddy -- cat "${dnsFileName}"`;
      const { stdout: catOut } = await execAsync(catCmd);
      const txt = catOut.trim();
      const pMatch = txt.match(/p=([A-Za-z0-9+/=]+)/);
      return {
        selector,
        txtRecord: txt,
        publicKey: pMatch ? pMatch[1] : "",
      };
    }

    // 2. Generate RSA 2048 key pair locally
    const { privateKey, publicKey } = crypto.generateKeyPairSync("rsa", {
      modulusLength: 2048,
      publicKeyEncoding: { type: "spki", format: "der" },
      privateKeyEncoding: { type: "pkcs1", format: "pem" },
    });

    const pubKeyBase64 = publicKey.toString("base64");
    const dkimDnsContent = `v=DKIM1; k=rsa; p=${pubKeyBase64}`;

    // 3. Write private key and dns record to Maddy pod
    const writeKeyCmd = `kubectl -n mail-server exec deployment/maddy -i -- sh -c 'cat > "${keyFileName}" && chmod 600 "${keyFileName}"'`;
    await new Promise<void>((resolve, reject) => {
      const proc = exec(writeKeyCmd, (err) => (err ? reject(err) : resolve()));
      proc.stdin?.write(privateKey);
      proc.stdin?.end();
    });

    const writeDnsCmd = `kubectl -n mail-server exec deployment/maddy -i -- sh -c 'cat > "${dnsFileName}" && chmod 644 "${dnsFileName}"'`;
    await new Promise<void>((resolve, reject) => {
      const proc = exec(writeDnsCmd, (err) => (err ? reject(err) : resolve()));
      proc.stdin?.write(dkimDnsContent);
      proc.stdin?.end();
    });

    console.log(
      `[Maddy] Generated and stored DKIM key for ${cleanDomain} (selector ${selector})`,
    );

    return {
      selector,
      txtRecord: dkimDnsContent,
      publicKey: pubKeyBase64,
    };
  } catch (err: any) {
    console.warn(
      `[Maddy] Could not generate/retrieve DKIM key for ${cleanDomain}:`,
      err.message,
    );
    return null;
  }
}

/**
 * Creates or updates SMTP credentials for a tenant in Maddy.
 */
export async function provisionMaddyCredentials(
  domain: string,
  alias = "contact",
  providedPassword?: string,
): Promise<{
  success: boolean;
  credentials?: SmtpCredentials;
  error?: string;
}> {
  const cleanDomain = domain
    .toLowerCase()
    .trim()
    .replace(/^www\./, "");
  const username = `${alias}@${cleanDomain}`;
  const password = providedPassword || generateSmtpPassword();

  try {
    // 1. Try creating user
    const createCmd = `kubectl -n mail-server exec deployment/maddy -- maddy creds create -p "${password.replace(/"/g, '\\"')}" "${username}"`;
    try {
      await execAsync(createCmd);
      console.log(`[Maddy] Created SMTP account: ${username}`);
    } catch (createErr: any) {
      // If user already exists, update password
      if (
        createErr.stderr?.includes("already exist") ||
        createErr.stdout?.includes("already exist")
      ) {
        console.log(
          `[Maddy] User ${username} already exists, updating password...`,
        );
        const updateCmd = `kubectl -n mail-server exec deployment/maddy -- maddy creds password -p "${password.replace(/"/g, '\\"')}" "${username}"`;
        await execAsync(updateCmd);
      } else {
        throw createErr;
      }
    }

    return {
      success: true,
      credentials: {
        host: "mail.ether.paris",
        port: 587,
        security: "STARTTLS",
        username,
        password,
      },
    };
  } catch (err: any) {
    console.error(
      `[Maddy] Failed to provision credentials for ${username}:`,
      err,
    );
    return {
      success: false,
      error: err.message,
    };
  }
}
