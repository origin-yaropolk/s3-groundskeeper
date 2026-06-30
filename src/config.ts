import * as path from 'path';
import * as fs from 'fs';
import yargs, { Argv } from 'yargs';
import minimatch from 'minimatch';


export interface ProcessArgv {
	src: string;
	['s3-region']: string;
	['s3-endpoint']: string | undefined;
	['s3-key']: string;
	['s3-seckey']: string;
	['s3-bucket']: string;
	['artifactory-url']: string;
	['artifactory-user']: string;
	['artifactory-password']: string | undefined;
	['artifactory-apikey']: string | undefined;
	['gitlab-url']: string;
	['gitlab-token']: string;
	['gitlab-project-id']: string;
	['gitlab-artifact-path']: string;
	meta: string;
	['dry-run']: boolean;
}

let procArgs: ProcessArgv | undefined;

export function setupArgv(): void {
	const argv = (yargs(process.argv) as unknown as Argv)
		.option('src', {  alias: 's', demand: true, description: 'source directory to sync'})
		.option('s3-region', { demand: true,  description: 'S3 Region'})
		.option('s3-endpoint', { demand: false,  description: 'S3 Endpoint'})
		.option('s3-key', { demand: true,  description: 'S3 Access Key'})
		.option('s3-seckey', { demand: true,  description: 'S3 Secret Access Key'})
		.option('s3-bucket', { alias: 'b', demand: true, description: 'S3 destination bucket name'})
		.option('artifactory-url', { demand: false, default: '', description: 'jfrog Artifactory base URL'})
		.option('artifactory-user', { demand: false, default: '', description: 'jfrog Artifactory user'})
		.option('artifactory-password', { demand: false, default: '', description: 'jfrog Artifactory user\'s password'})
		.option('artifactory-apikey', { demand: false, default: '', description: 'jfrog Artifactory user\'s Api key' })
		.option('gitlab-url', { demand: false, default: '', description: 'GitLab base URL (for gitlab metapointers)' })
		.option('gitlab-token', { demand: false, default: '', description: 'GitLab private token (for gitlab metapointers)' })
		.option('gitlab-project-id', { demand: false, default: '', description: 'GitLab project id (for gitlab metapointers)' })
		.option('gitlab-artifact-path', { demand: false, default: '', description: 'Default job artifact path when metapointer has no oid path' })
		.option('meta', {demand: false, default: '', description: 'Content meta information.' } )
		.option('dry-run', { alias: 'n', demand: false, default: false, ['boolean']: true, description: 'Dry run: do nothing only prints what to do.'})
		.option('show-conf', { demand: false, default: false, ['boolean']: true, description: 'Print json object for the used configuration'})
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
