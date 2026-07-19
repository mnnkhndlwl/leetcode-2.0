import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";

function requireEnv(name) {
    const v = process.env[name];
    if (!v) throw new Error(`${name} is not set. Add it to db-explorer-mcp/.env`);
    return v;
}

export function createS3Client() {
    return {
        client: new S3Client({
            region: requireEnv("AWS_REGION"),
            credentials: {
                accessKeyId: requireEnv("AWS_ACCESS_KEY_ID"),
                secretAccessKey: requireEnv("AWS_SECRET_ACCESS_KEY"),
            },
        }),
        bucket: requireEnv("TEST_CASES_S3_BUCKET"),
    };
}

export function testCasesS3Key(slug) {
    return `test-cases/${slug}/cases.json`;
}

/**
 * Upload cases.json, then GetObject + re-parse to prove the judge can load it.
 * Returns { key, caseCount }.
 */
export async function uploadAndVerifyTestCases(s3, slug, testCases) {
    const key = testCasesS3Key(slug);
    const body = JSON.stringify(testCases, null, 2) + "\n";

    await s3.client.send(
        new PutObjectCommand({
            Bucket: s3.bucket,
            Key: key,
            Body: body,
            ContentType: "application/json",
        })
    );

    const got = await s3.client.send(
        new GetObjectCommand({
            Bucket: s3.bucket,
            Key: key,
        })
    );
    const text = await got.Body.transformToString();
    let parsed;
    try {
        parsed = JSON.parse(text);
    } catch {
        await deleteTestCases(s3, key).catch(() => {});
        throw new Error("S3 round-trip failed: uploaded object is not valid JSON");
    }

    if (!Array.isArray(parsed) || parsed.length !== testCases.length) {
        await deleteTestCases(s3, key).catch(() => {});
        throw new Error(
            `S3 round-trip failed: expected ${testCases.length} cases, got ${Array.isArray(parsed) ? parsed.length : typeof parsed}`
        );
    }

    for (let i = 0; i < parsed.length; i++) {
        if (parsed[i].input !== testCases[i].input || parsed[i].expectedOutput !== testCases[i].expectedOutput) {
            await deleteTestCases(s3, key).catch(() => {});
            throw new Error(`S3 round-trip failed: case ${i + 1} content mismatch after download`);
        }
    }

    return { key, caseCount: parsed.length, s3Uri: `s3://${s3.bucket}/${key}` };
}

export async function deleteTestCases(s3, key) {
    await s3.client.send(
        new DeleteObjectCommand({
            Bucket: s3.bucket,
            Key: key,
        })
    );
}
