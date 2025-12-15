import CryptoJS from "crypto-js";

export interface DecryptedHash {
  contentHash: string;
  uid?: string; // address (if logged in) or deviceId (if not logged in)
  version: number; // 1 if old version (no '-' separator), 2 if new version (contentHash-uid)
}

export const decryptHash = (encryptedHash: string | undefined, key: string): DecryptedHash | null => {
  try {
    if (!encryptedHash) {
      return null;
    }
    let base64 = encryptedHash.replace(/-/g, "+").replace(/_/g, "/");
    while (base64.length % 4) {
      base64 += "=";
    }
    const decrypted = CryptoJS.RC4.decrypt(base64, key);
    const decryptedStr = decrypted.toString(CryptoJS.enc.Utf8);
    
    // Check if it contains '-' separator (new version: contentHash-uid)
    const dashIndex = decryptedStr.indexOf('-');
    if (dashIndex > 0 && dashIndex < decryptedStr.length - 1) {
      // New version: split into contentHash and uid (address or deviceId)
      const contentHash = decryptedStr.slice(0, dashIndex);
      const uid = decryptedStr.slice(dashIndex + 1);
      return {
        contentHash,
        uid,
        version: 2,
      };
    } else {
      // Legacy version: only contentHash, no separator
      return {
        contentHash: decryptedStr,
        version: 1,
      };
    }
  } catch (error: any) {
    console.error(`Decryption error: ${error.message}`);
    // Return as legacy format if decryption fails
    return encryptedHash ? {
      contentHash: encryptedHash,
      version: 1,
    } : null;
  }
};
