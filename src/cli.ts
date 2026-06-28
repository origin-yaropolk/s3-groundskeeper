#!/usr/bin/env node

import { exit } from 'process';
import { S3Storage } from './s3-storage.js';
import { FsStorage } from './fs-storage.js';
import { setupArgv, getArgv, isS3SourceMode, getS3SrcConfig } from './config.js';
import { syncStorage } from './storage-sync.js';
import { ReadonlyStorage } from './storage-api.js';
import * as diag from './diag.js';

async function main(): Promise<number | undefined> {
	const argv = getArgv();

	let sourceStorage: ReadonlyStorage;
	if (isS3SourceMode()) {
		sourceStorage = new S3Storage(getS3SrcConfig());
	}
	else {
		if (!argv.src) {
			throw new Error('--src is required when --s3-src-bucket is not set');
		}
		sourceStorage = new FsStorage(argv.src);
	}

	const targetStorage = new S3Storage();
	
	await syncStorage(sourceStorage, targetStorage, argv['dry-run']);
	return 0;
}


process.on('unhandledRejection', () => {
	// console.debug('Unhandled promise rejection:');
	// console.debug(diag.messageOfError(error));
});

setupArgv();

main()
	.then(code => {
			if (typeof code === 'number' && code  !== 0) {
				exit(code);
			}
	})
	.catch((error: unknown) => {
		console.error('Error:');
		console.error(diag.messageOfError(error));
		exit(-1);
	});
