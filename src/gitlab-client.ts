import type { IncomingMessage } from 'http';
import * as http from './utils/http.js';

export interface GitLabClientConfig {
	baseUrl: URL;
	token: string;
	projectId: string;
	defaultArtifactPath?: string;
}

export interface GitLabResolvedItem {
	downloadUrl: URL;
	expectedMd5?: string;
	size?: number;
}

export interface GitLabClient {
	resolveFromOids(oids: Readonly<Record<string, string>>): Promise<GitLabResolvedItem>;
	getContentStream(item: GitLabResolvedItem): Promise<IncomingMessage>;
}

function authHeaders(token: string): Record<string, string> {
	return { 'PRIVATE-TOKEN': token };
}

function resolveUrl(baseUrl: URL, relativePath: string): URL {
	const base = baseUrl.toString().endsWith('/') ? baseUrl.toString() : `${baseUrl.toString()}/`;
	return new URL(relativePath, base);
}

function encodeArtifactPath(artifactPath: string): string {
	return artifactPath
		.split('/')
		.map(segment => encodeURIComponent(segment))
		.join('/');
}

function encodeGenericPath(genericPath: string): string {
	return genericPath
		.split('/')
		.map(segment => encodeURIComponent(segment))
		.join('/');
}

function buildJobArtifactUrl(config: GitLabClientConfig, jobId: string, artifactPath: string): URL {
	const projectId = encodeURIComponent(config.projectId);
	const encodedJobId = encodeURIComponent(jobId);
	const encodedPath = encodeArtifactPath(artifactPath);
	return resolveUrl(
		config.baseUrl,
		`api/v4/projects/${projectId}/jobs/${encodedJobId}/artifacts/${encodedPath}`,
	);
}

function buildGenericPackageUrl(config: GitLabClientConfig, genericPath: string): URL {
	const projectId = encodeURIComponent(config.projectId);
	const encodedPath = encodeGenericPath(genericPath);
	return resolveUrl(
		config.baseUrl,
		`api/v4/projects/${projectId}/packages/generic/${encodedPath}`,
	);
}

async function readContentLength(url: URL, headers: Record<string, string>): Promise<number | undefined> {
	const response = await http.head(url, { headers });
	response.resume();

	const contentLength = response.headers['content-length'];
	if (!contentLength) {
		return undefined;
	}

	const size = Number(contentLength);
	return Number.isFinite(size) ? size : undefined;
}

class GitLab implements GitLabClient {
	private readonly config: GitLabClientConfig;

	constructor(config: GitLabClientConfig) {
		this.config = config;
	}

	public async resolveFromOids(oids: Readonly<Record<string, string>>): Promise<GitLabResolvedItem> {
		const expectedMd5 = oids.md5?.toLowerCase();
		let downloadUrl: URL | undefined;

		if (oids.job) {
			const artifactPath = oids.path ?? this.config.defaultArtifactPath;
			if (!artifactPath) {
				throw new Error(
					'GitLab job metapointer requires oid path:<artifact-path> or --gitlab-artifact-path',
				);
			}
			downloadUrl = buildJobArtifactUrl(this.config, oids.job, artifactPath);
		}
		else if (oids.generic) {
			downloadUrl = buildGenericPackageUrl(this.config, oids.generic);
		}
		else if (oids.md5) {
			throw new Error(
				'GitLab metapointer with only oid md5 is not supported; add oid job:<id> or oid generic:<package>/<version>/<build>/<file>',
			);
		}
		else {
			throw new Error('GitLab metapointer must include oid job:<id> or oid generic:<path>');
		}

		const headers = authHeaders(this.config.token);
		const size = await readContentLength(downloadUrl, headers);

		return {
			downloadUrl,
			expectedMd5,
			size,
		};
	}

	public getContentStream(item: GitLabResolvedItem): Promise<IncomingMessage> {
		return http.get(item.downloadUrl, { headers: authHeaders(this.config.token) });
	}
}

export function createGitLabClient(config: GitLabClientConfig): GitLabClient {
	return new GitLab(config);
}

export function createGitLabMetapointerContent(options: {
	md5: string;
	jobId: string | number;
	artifactPath: string;
}): string {
	const lines = [
		'#metapointer gitlab',
		`oid md5:${options.md5.toLowerCase()}`,
		`oid job:${options.jobId}`,
		`oid path:${options.artifactPath}`,
	];

	return `${lines.join('\n')}\n`;
}

export function createGitLabGenericMetapointerContent(options: {
	md5: string;
	genericPath: string;
}): string {
	const lines = [
		'#metapointer gitlab',
		`oid md5:${options.md5.toLowerCase()}`,
		`oid generic:${options.genericPath}`,
	];

	return `${lines.join('\n')}\n`;
}
