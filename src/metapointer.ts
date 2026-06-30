import * as fs from 'fs';

export interface MetaPointer {
	readonly source: string;
	readonly oid: { kind: string; value: string };
	readonly oids: Readonly<Record<string, string>>;
}

const OID_LINE_RE = /^oid ([A-Za-z0-9_]+):([A-Za-z0-9._/:-]+)$/;

export async function readMetaPointerFromFile(filePath: string, existingStats?: fs.Stats): Promise<MetaPointer | undefined> {
	const tag = '#metapointer';

	const stats = existingStats ?? await fs.promises.lstat(filePath);
	if (stats.size <= tag.length) {
		return ;
	}

	const handle = await fs.promises.open(filePath, 'r');

	try {
		const readString = (len: number): Promise<string> => {
			return handle.read(Buffer.alloc(len), 0, len, 0).then(result => {
				return result.buffer.toString('utf8', 0, result.bytesRead);
			});
		};

		const tagLine = await readString(tag.length);
		if (tagLine !== tag) {
			return;
		}

		const content = await readString(stats.size);
		const lines = content
			.split('\n')
			.map(l => l.trim())
			.filter(l => l.length > 0)
			;

		const source = (() => {
			const line0 = lines.shift();
			if (!line0) {
				return;
			}
			const match = /#metapointer ([a-z0-9_]+)$/.exec(line0);
			return (match && match.length > 1) ? match[1] : undefined;
		})();

		if (!source) {
			throw new Error(`Invalid #metapointer, source must be specified: ${filePath}`);
		}

		const oids: Record<string, string> = {};
		let primaryOid: { kind: string; value: string } | undefined;

		for (const line of lines) {
			const match = OID_LINE_RE.exec(line);
			if (!match) {
				continue;
			}

			const kind = match[1];
			const value = match[2];
			oids[kind] = value;

			if (!primaryOid) {
				primaryOid = { kind, value };
			}
		}

		if (!primaryOid) {
			throw new Error(`Invalid #metapointer, oid must be specified: ${filePath}`);
		}

		return {
			source,
			oid: primaryOid,
			oids,
		};
	}
	finally {
		await handle.close();
	}
}
