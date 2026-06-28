import * as path from 'path';
import * as fs from 'fs';
import yargs, { Argv } from 'yargs';
import minimatch from 'minimatch';


export interface S3ConnectionConfig {
	accessKey: string;
	secretAccessKey: string;
	region: string;
	endpoint: string | undefined;
	bucket: string;
}

export interface ProcessArgv {
	src: string | undefined;
	['s3-region']: string;
	['s3-endpoint']: string | undefined;
	['s3-key']: string;
	['s3-seckey']: string;
	['s3-bucket']: string;
	['s3-src-bucket']: string | undefined;
	['s3-src-region']: string | undefined;
	['s3-src-endpoint']: string | undefined;
	['s3-src-key']: string | undefined;
	['s3-src-seckey']: string | undefined;
	['artifactory-url']: string;
	['artifactory-user']: string;
	['artifactory-password']: string | undefined;
	['artifactory-apikey']: string | undefined;
	meta: string;
	['dry-run']: boolean;
}

let procArgs: ProcessArgv | undefined;

export function setupArgv(): void {
	const argv = (yargs(process.argv) as unknown as Argv)
		.option('src', {  alias: 's', demand: false, description: 'source directory to sync'})
		.option('s3-region', { demand: true,  description: 'S3 Region'})
		.option('s3-endpoint', { demand: false,  description: 'S3 Endpoint'})
		.option('s3-key', { demand: true,  description: 'S3 Access Key'})
		.option('s3-seckey', { demand: true,  description: 'S3 Secret Access Key'})
		.option('s3-bucket', { alias: 'b', demand: true, description: 'S3 destination bucket name'})
		.option('s3-src-bucket', { demand: false, description: 'S3 source bucket name (enables S3->S3 sync)'})
		.option('s3-src-region', { demand: false, description: 'S3 source region (defaults to --s3-region)'})
		.option('s3-src-endpoint', { demand: false, description: 'S3 source endpoint (defaults to --s3-endpoint)'})
		.option('s3-src-key', { demand: false, description: 'S3 source access key (defaults to --s3-key)'})
		.option('s3-src-seckey', { demand: false, description: 'S3 source secret key (defaults to --s3-seckey)'})
		.option('artifactory-url', { demand: false, default: '', description: 'jfrog Artifatory base URL'})
		.option('artifactory-user', { demand: false, default: '', description: 'jfrog Artifatory user'})
		.option('artifactory-password', { demand: false, description: 'jfrog Artifatory user\'s password'})
		.option('artifactory-apikey', { demand: false, description: 'jfrog Artifatory user\'s Api key' })
		.option('meta', {demand: false, default: '', description: 'Content meta information.' } )
		.option('dry-run', { alias: 'n', demand: false, default: false, ['boolean']: true, description: 'Dry run: do nothing only prints what to do.'})
		.option('show-conf', { demand: false, default: false, ['boolean']: true, description: 'Print json object for the used configuration'})
		.check((args) => {
			if (args['s3-src-bucket']) {
				return true;
			}
			if (!args.src) {
				throw new Error('--src is required when --s3-src-bucket is not set');
			}
			return true;
		})
		.argv;

	if ((argv as unknown as {['show-conf']?: boolean})['show-conf'] ?? false) {
		console.log(`Used confuguration:\n${JSON.stringify(argv, undefined, 1)}`);
	}

	procArgs = argv as unknown as ProcessArgv;
}

export function getArgv(): ProcessArgv {
	if (!procArgs) {
		console.log('Process argv not initialized');
		process.exit(1);
	}

	return procArgs;
}

export function isS3SourceMode(): boolean {
	return !!getArgv()['s3-src-bucket'];
}

export function getS3DestConfig(): S3ConnectionConfig {
	const argv = getArgv();
	return {
		accessKey: argv['s3-key'],
		secretAccessKey: argv['s3-seckey'],
		region: argv['s3-region'],
		endpoint: argv['s3-endpoint'],
		bucket: argv['s3-bucket']
	};
}

export function getS3SrcConfig(): S3ConnectionConfig {
	const argv = getArgv();
	const srcBucket = argv['s3-src-bucket'];
	if (!srcBucket) {
		throw new Error('S3 source bucket is not configured');
	}

	return {
		accessKey: argv['s3-src-key'] ?? argv['s3-key'],
		secretAccessKey: argv['s3-src-seckey'] ?? argv['s3-seckey'],
		region: argv['s3-src-region'] ?? argv['s3-region'],
		endpoint: argv['s3-src-endpoint'] ?? argv['s3-endpoint'],
		bucket: srcBucket
	};
}

export interface ContentMeta {
	contentType?: string;
}

interface ContentMetaEntry extends ContentMeta {
	glob: string | string [];
}

function globMatch(value: string, pattern?: string | string[]): boolean {
	if (!pattern) {
		return false;
	}

	const checkMatch  = (ptrn: string): boolean => {
		return minimatch(value, ptrn, {nocase: true});
	};

	if (typeof pattern === 'string') {
		return checkMatch(pattern);
	}

	return pattern.some(checkMatch);
}

let contentsMeta: ContentMetaEntry[] | undefined;

export function findMetaForPath(filePath: string): ContentMeta | undefined {
	if (!contentsMeta) {
		let confPath = getArgv().meta;
		if (confPath === '') {
			contentsMeta = [];
			return;
		}

		if (!path.isAbsolute(confPath)) {
			confPath = path.join(process.cwd(), confPath);
		}

		if (!fs.existsSync(confPath)) {
			throw new Error(`Not exists: (${confPath})`);
		}

		const content = fs.readFileSync(confPath, {encoding: 'utf8'}) ;
		contentsMeta = JSON.parse(content) as unknown as ContentMetaEntry[];
	}

	return contentsMeta.find((desc: ContentMetaEntry): boolean => {
		return globMatch(filePath, desc.glob);
	});
}
