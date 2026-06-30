# S3 Grounds Keeper

One way synchronization local directory content with Amazon S3 bucket.



## Setup, develop, build

### npm
setup: `npm i`  
start develop: `npm run build`

### Git dependency (pnpm / npm)

The package builds on install via the `prepare` script (`tsc` → `dist/`).  
When using a git URL, allow build scripts (pnpm: add to `onlyBuiltDependencies` in `pnpm-workspace.yaml`).

```json
"s3-groundskeeper": "github:<org>/s3-groundskeeper#<commit-or-branch>"
```


## CLI

|--arg                          |-short    | required | description              |
|-------------------------------|----------|----------|--------------------------|
|--src=path                     | -s=path  |*         | path to source (sync out) directory |
|--s3-region=name               |          |*         | S3 Bucket's region       |
|--s3-endpoint=url              |          |          | S3 Endpoint URL          |
|--s3-key=key                   |          |*         | S3 Access Key            |
|--s3-seckey=key                |          |*         | S3 Secret Access Key            |
|--s3-bucket=name               | -b=name  |*         | S3 destination (sync in) bucket name (**NOT ARN**, just a name)   |
|--artifactory-url=url          |          |          | jfrog Artifactory base url |
|--artifactory-user=username    |          |          | jfrog Artifactory user |
|--artifactory-password=password|          |          | jfrog Artifactory user's password |
|--artifactory-apikey=jfapikey  |          |          | jfrog Artifactory user's Api key |
|--gitlab-url=url               |          |          | GitLab base url |
|--gitlab-token=token           |          |          | GitLab private token |
|--gitlab-project-id=id         |          |          | GitLab project id |
|--gitlab-artifact-path=path    |          |          | Default job artifact path when metapointer omits oid path |
|--dry-run                      | -n       |          | Dry run: do nothing only prints what to do. |
|--show-conf                    |          |          | Print json object for the used configuration. |

### jFrog notes

Currently supported [Basic authentication using your username and API Key](https://www.jfrog.com/confluence/display/JFROG/Artifactory+REST+API#ArtifactoryRESTAPI-Authentication): user name and Api key must be provided. Each request will use **Authorization** (http header) = base64('Basic jfuser:jfapikey'). Instead of api key password also can be used.

### S3 notes

Access to s3 bucket provided through **AWS SDK/Client S3 Api**.
There is required parameters to configure access to S3 resources:
* region;
* access key / secret access key;
* target bucket's name;


## Metapointer file format.

> **#metapointer** *PROVIDERNAME*
> **oid** *provider_secific_data*

Providers:

|Provider   |Data                                      | Sample                                 |
|-----------|------------------------------------------|----------------------------------------|
|jfrogart   | **oid** aql_request_field:field_value    |oid md5:e26a6019c8da5d9a3e6f742c0c6cc02c|
|gitlab     | **oid** job or generic + optional md5    |oid job:5876                           |

Sample for jfrogart

> **#metapointer** *jfrogart*
> **oid** *md5:e26a6019c8da5d9a3e6f742c0c6cc02c*

or

> **#metapointer** *jfrogart*
> **oid** *name:myfilename.txt*

Sample for gitlab (job artifact):

> **#metapointer** *gitlab*
> **oid** *md5:6c0031479237272d51613e5d64558909*
> **oid** *job:5876*
> **oid** *path:out/Package.msix*

Alternatively, omit `oid path:` and pass `--gitlab-artifact-path=out/Package.msix` to s3gk.

Sample for gitlab (generic package):

> **#metapointer** *gitlab*
> **oid** *md5:6c0031479237272d51613e5d64558909*
> **oid** *generic:my-package/0.3.0/92/Package.msix*

### GitLab CLI options

|--arg                          | required | description |
|-------------------------------|----------|-------------|
|--gitlab-url=url               | for gitlab metapointers | GitLab base URL |
|--gitlab-token=token           | for gitlab metapointers | GitLab private token |
|--gitlab-project-id=id         | for gitlab metapointers | GitLab project id |
|--gitlab-artifact-path=path    | no | Default artifact path for `oid job:` |

`oid md5:` is used for S3 sync metadata (like jfrog `actual_md5`). GitLab does not resolve files by md5 alone — pair it with `oid job:` or `oid generic:`.

## Publish a new release
1. Make an annotated git tag using `git tag -a <version>` or `git tag -s <version>`, if signed tag is preferred.
1. Checkout the tag, cleanup the working tree.
1. Install the dependencies: `npm ci`.
1. Build the package: `npm run build -- --version <version>`.
1. Create the tarball: `npm pack ./dist`, check the tarball contents.
1. Publish the tarball: `npm publish <path-to-tgz>`.
