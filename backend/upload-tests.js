import "@dotenvx/dotenvx/config";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { Pool } from "pg";
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join } from "node:path";

const BUCKET = process.env.TEST_CASES_S3_BUCKET;
const REGION = process.env.AWS_REGION;
if (!BUCKET) throw new Error("TEST_CASES_S3_BUCKET is not set");

const s3 = new S3Client({
  region: REGION,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },
});
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const root = join(process.cwd(), "test-cases");
const slugs = readdirSync(root, { withFileTypes: true })
  .filter((d) => d.isDirectory() && existsSync(join(root, d.name, "cases.json")))
  .map((d) => d.name)
  .sort();

for (const slug of slugs) {
  const key = `test-cases/${slug}/cases.json`;
  const body = readFileSync(join(root, slug, "cases.json"));
  // sanity check: must be a non-empty JSON array
  const parsed = JSON.parse(body.toString());
  if (!Array.isArray(parsed) || parsed.length === 0) throw new Error(`${slug}: cases.json is not a non-empty array`);

  await s3.send(
    new PutObjectCommand({
      Bucket: BUCKET,
      Key: key,
      Body: body,
      ContentType: "application/json",
    }),
  );

  const r = await pool.query(
    `update problems set "testCasesFileUrl" = $1, "updatedAt" = now() where slug = $2`,
    [key, slug],
  );
  console.log(`${r.rowCount ? "OK " : "WARN(no row)"} ${slug.padEnd(48)} ${parsed.length} cases -> s3://${BUCKET}/${key}`);
}

await pool.end();
console.log(`\nUploaded ${slugs.length} problems to s3://${BUCKET} (region ${REGION}).`);
