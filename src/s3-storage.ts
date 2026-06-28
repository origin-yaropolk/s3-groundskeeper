import * as stream from 'stream';
import * as S3 from '@aws-sdk/client-s3';
import { getS3DestConfig, S3ConnectionConfig } from './config.js';
import { Storage, StorageOp,  StorageObject, ObjectMeta } from './storage-api';

export type S3Config = S3ConnectionConfig;

class S3Object implements StorageObject {
	private readonly client: S3.S3Client;
	private readonly bucket: string;
	private readonly obj: S3._Object;

	constructor(client: S3.S3Client, bucket: string, obj: S3._Object) {
		this.client = client;
		this.bucket = bucket;
		this.obj = obj;
	}

	get key(): string {
		// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
		return this.obj.Key!;
	}

	async meta(): Promise<ObjectMeta> {
		const mt = await this.client.send(new S3.HeadObjectCommand({Bucket: this.bucket, Key: this.key}));

		// see: https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/ETag
		const etag = mt.ETag ?? this.obj.ETag;
		const md5 = etag ? etag.replace(/"/g, '') : undefined;

		return {
			key: this.key,
			size: mt.ContentLength ?? this.obj.Size ?? 0,
			md5,
			contentType: mt.ContentType,
			redirectPath: mt.WebsiteRedirectLocation,
			custom: mt.Metadata
		};
	}

	get description(): string {
		return `s3://${this.bucket}/${this.key}`;
	}

	async open(): Promise<stream.Readable> {
		const response = await this.client.send(new S3.GetObjectCommand({
			Bucket: this.bucket,
			Key: this.key
		}));

		if (!response.Body) {
			throw new Error(`S3 object body is empty: s3://${this.bucket}/${this.key}`);
		}

		return response.Body as stream.Readable;
	}
}

export class S3Storage implements Storage {

	private readonly client: S3.S3Client;
	private readonly config: S3Config;

	constructor(config?: S3Config) {
		this.config = config ?? getS3DestConfig();
		const clientConfig: S3.S3ClientConfig = {
			region: this.config.region,
			credentials: {
				accessKeyId: this.config.accessKey,
				secretAccessKey: this.config.secretAccessKey
			},
			endpoint: this.config.endpoint,
			forcePathStyle: this.config.endpoint !== undefined,
		};

		this.client = new S3.S3Client(clientConfig);
	}

	get bucket(): string {
		return this.config.bucket;
	}

	async list(): Promise<StorageObject[]> {
		const bucket = this.bucket;
		const objects: StorageObject[] = [];
		let continuationToken: string | undefined;

		do {
			const data: S3.ListObjectsV2CommandOutput = await this.client.send(new S3.ListObjectsV2Command({
				Bucket: bucket,
				ContinuationToken: continuationToken
			}));

			if (data.Contents) {
				for (const obj of data.Contents) {
					if (typeof obj.Key === 'string' && obj.Key.length > 0) {
						objects.push(new S3Object(this.client, bucket, obj));
					}
				}
			}

			continuationToken = data.IsTruncated ? data.NextContinuationToken : undefined;
		} while (continuationToken);

		return objects;
	}

	del(key: string): StorageOp {
		const run = async (): Promise<void> => {
			const params: S3.DeleteObjectCommandInput = {
				Key: key,
				Bucket: this.bucket
			};

			await this.client.send(new S3.DeleteObjectCommand(params));
		};

		const describe = (): Promise<string> => Promise.resolve(`S3 bucket (${this.bucket}) delete object (${key})`);

		return {
			describe,
			run
		};
	}

	put(obj: StorageObject): StorageOp {
		const metaPromise = obj.meta();

		const run = async (): Promise<void> => {
			const bucket = this.bucket;
			const meta = await metaPromise;

			const params: S3.PutObjectCommandInput = {
				Key: obj.key,
				Bucket: bucket,
				Metadata: meta.custom
			};

			if (meta.contentType) {
				params.ContentType = meta.contentType;
			}

			// if (meta.md5) {
			// 	params.ContentMD5 = meta.md5;
			// }

			if (meta.redirectPath) {
				params.WebsiteRedirectLocation = meta.redirectPath;
			}
			else {
				params.ContentLength = meta.size;
				params.Body = await obj.open();
			}

			await this.client.send(new S3.PutObjectCommand(params));
		};

		const describe = async (): Promise<string> => {
			const bucket = this.bucket;
			const meta = await metaPromise;

			if (meta.redirectPath) {
				return `S3 bucket (${bucket}) put object (${obj.key}) with redirect location (${meta.redirectPath})`;
			}
			return `S3 bucket (${bucket}) put object (${obj.key}) from ${obj.description ?? 'no description' } `;
		};

		return {
			describe,
			run
		};
	}
}
