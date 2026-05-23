import crypto from "crypto";

/**
 * Provides static methods for AES-256-CBC encryption and decryption.
 * Compatible with the encryption format used by the C# example
 * (IV prepended to ciphertext, then Base64 encoded).
 */
export class AES256Encryption {
  // AES-256 uses a 256-bit (32-byte) key.
  private static readonly keySize = 256;
  // AES uses a 128-bit (16-byte) block size, hence the IV size.
  private static readonly blockSize = 128;
  private static readonly ivLength = AES256Encryption.blockSize / 8; // 16 bytes
  // Algorithm specifier for Node.js crypto module
  private static readonly algorithm = "aes-256-cbc";

  /**
   * Encrypts the given plain text using AES-256-CBC encryption.
   * The IV is generated randomly and prepended to the ciphertext.
   * The result (IV + ciphertext) is Base64 encoded.
   *
   * @param plainText The plain text to encrypt.
   * @param key A 32-character (UTF-8 encoded) key for AES-256 encryption.
   * @returns The encrypted text as a Base64-encoded string (IV + ciphertext).
   * @throws {Error} Thrown if the plain text is null/empty or the key is not 32 bytes long.
   */
  public static encrypt(plainText: string, key: string): string {
    if (!plainText) {
      throw new Error("Plain text cannot be null or empty.");
    }

    const keyBuffer = Buffer.from(key, "utf8");
    if (keyBuffer.length !== 32) {
      throw new Error(
        "Key must be 32 bytes long (UTF-8 encoded) for AES-256 encryption."
      );
    }

    // Generate a random Initialization Vector (IV)
    const iv = crypto.randomBytes(AES256Encryption.ivLength); // 16 bytes for AES

    // Create the cipher instance
    const cipher = crypto.createCipheriv(
      AES256Encryption.algorithm,
      keyBuffer,
      iv
    );

    // Encrypt the plain text (ensure input is UTF-8)
    let encrypted = cipher.update(plainText, "utf8");
    // Finalize encryption (handles padding)
    encrypted = Buffer.concat([encrypted, cipher.final()]);

    // Prepend the IV to the ciphertext and encode as Base64
    const resultBuffer = Buffer.concat([iv, encrypted]);
    return resultBuffer.toString("base64");
  }

  /**
   * Decrypts the given Base64 encoded ciphertext using AES-256-CBC decryption.
   * Expects the IV to be prepended to the ciphertext within the Base64 string.
   *
   * @param cipherText The encrypted text as a Base64-encoded string (IV + ciphertext).
   * @param key A 32-character (UTF-8 encoded) key for AES-256 decryption.
   * @returns The decrypted plain text.
   * @throws {Error} Thrown if the cipher text is null/empty, the key is not 32 bytes long,
   * or if decryption fails (e.g., invalid key, corrupted data, padding error).
   */
  public static decrypt(cipherText: string, key: string): string {
    if (!cipherText) {
      throw new Error("Cipher text cannot be null or empty.");
    }

    const keyBuffer = Buffer.from(key, "utf8");
    if (keyBuffer.length !== 32) {
      throw new Error(
        "Key must be 32 bytes long (UTF-8 encoded) for AES-256 decryption."
      );
    }

    try {
      // Decode the Base64 string
      const cipherBytes = Buffer.from(cipherText, "base64");

      // Extract the IV from the beginning
      if (cipherBytes.length < AES256Encryption.ivLength) {
        throw new Error("Invalid cipher text length: cannot extract IV.");
      }
      const iv = cipherBytes.subarray(0, AES256Encryption.ivLength);

      // Extract the actual encrypted data
      const encryptedText = cipherBytes.subarray(AES256Encryption.ivLength);

      // Create the decipher instance
      const decipher = crypto.createDecipheriv(
        AES256Encryption.algorithm,
        keyBuffer,
        iv
      );

      // Decrypt the data
      let decrypted = decipher.update(encryptedText);
      // Finalize decryption (handles padding removal)
      decrypted = Buffer.concat([decrypted, decipher.final()]);

      // Convert the decrypted buffer back to a UTF-8 string
      return decrypted.toString("utf8");
    } catch (error: any) {
      // Catch errors during decryption (e.g., bad padding, wrong key)
      throw new Error(`Decryption failed: ${error.message}`);
    }
  }
}
