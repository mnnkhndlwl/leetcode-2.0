import { S3Client, GetObjectCommand } from "@aws-sdk/client-s3";

/**
 * @typedef {Object} TestCase
 * @property {number} id
 * @property {string} input
 * @property {string} expectedOutput
 */

export class TestCasesS3 {
  /** @param {import("./config.js").Config} cfg */
  constructor(cfg) {
    this.client = new S3Client({ region: cfg.awsRegion });
    this.bucket = cfg.s3BucketName;
  }

  /**
   * @param {string} key
   * @returns {Promise<Buffer>}
   */
  async download(key) {
    const out = await this.client.send(
      new GetObjectCommand({
        Bucket: this.bucket,
        Key: key,
      })
    );
    const bytes = await out.Body.transformToByteArray();
    return Buffer.from(bytes);
  }
}
