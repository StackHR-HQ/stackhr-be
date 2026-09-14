<p align="center">
  <a href="http://nestjs.com/" target="blank"><img src="https://nestjs.com/img/logo-small.svg" width="120" alt="Nest Logo" /></a>
</p>

[circleci-image]: https://img.shields.io/circleci/build/github/nestjs/nest/master?token=abc123def456
[circleci-url]: https://circleci.com/gh/nestjs/nest

  <p align="center">A progressive <a href="http://nodejs.org" target="_blank">Node.js</a> framework for building efficient and scalable server-side applications.</p>
    <p align="center">
<a href="https://www.npmjs.com/~nestjscore" target="_blank"><img src="https://img.shields.io/npm/v/@nestjs/core.svg" alt="NPM Version" /></a>
<a href="https://www.npmjs.com/~nestjscore" target="_blank"><img src="https://img.shields.io/npm/l/@nestjs/core.svg" alt="Package License" /></a>
<a href="https://www.npmjs.com/~nestjscore" target="_blank"><img src="https://img.shields.io/npm/dm/@nestjs/common.svg" alt="NPM Downloads" /></a>
<a href="https://circleci.com/gh/nestjs/nest" target="_blank"><img src="https://img.shields.io/circleci/build/github/nestjs/nest/master" alt="CircleCI" /></a>
<a href="https://discord.gg/G7Qnnhy" target="_blank"><img src="https://img.shields.io/badge/discord-online-brightgreen.svg" alt="Discord"/></a>
<a href="https://opencollective.com/nest#backer" target="_blank"><img src="https://opencollective.com/nest/backers/badge.svg" alt="Backers on Open Collective" /></a>
<a href="https://opencollective.com/nest#sponsor" target="_blank"><img src="https://opencollective.com/nest/sponsors/badge.svg" alt="Sponsors on Open Collective" /></a>
  <a href="https://paypal.me/kamilmysliwiec" target="_blank"><img src="https://img.shields.io/badge/Donate-PayPal-ff3f59.svg" alt="Donate us"/></a>
    <a href="https://opencollective.com/nest#sponsor"  target="_blank"><img src="https://img.shields.io/badge/Support%20us-Open%20Collective-41B883.svg" alt="Support us"></a>
  <a href="https://twitter.com/nestframework" target="_blank"><img src="https://img.shields.io/twitter/follow/nestframework.svg?style=social&label=Follow" alt="Follow us on Twitter"></a>
</p>
  <!--[![Backers on Open Collective](https://opencollective.com/nest/backers/badge.svg)](https://opencollective.com/nest#backer)
  [![Sponsors on Open Collective](https://opencollective.com/nest/sponsors/badge.svg)](https://opencollective.com/nest#sponsor)-->

## Description

[Nest](https://github.com/nestjs/nest) framework TypeScript starter repository.

StackHR's backend API runs locally on `http://localhost:3001` by default. The
versioned API base URL is `http://localhost:3001/v1/api`. The frontend is
expected to run on `http://localhost:3000`.

To configure local development, copy `.env.example` to `.env` and adjust the
values as needed. `FRONTEND_URL` controls the origin allowed by the backend's
CORS configuration.

Transactional email is sent through SendByte using `SENDBYTE_API_KEY` and
defaults to `StackHR <noreply@stackhr.app>`. The existing `SENDBYTE_KEY` name
is also supported for local compatibility.

For local development, use a SendByte sandbox key (`sk_test_`). Sandbox sends
simulate the full delivery pipeline and do not require DNS setup. Before live
sends, verify the sending domain in SendByte by publishing its SPF and DKIM
records, then replace the key with an `sk_live_` key and set
`SENDBYTE_FROM_EMAIL` to an address on that verified domain. The backend sends
through `https://api.sendbyte.africa/v1/emails`, supports plain-text fallbacks,
and forwards stable idempotency keys so retries do not duplicate messages.
See the [SendByte quickstart](https://docs.sendbyte.africa/quickstart),
[domain verification guide](https://docs.sendbyte.africa/guides/domains), and
[idempotency guide](https://docs.sendbyte.africa/guides/idempotency).

### Cloudflare R2 storage

The document-storage adapter uses the S3-compatible API, so it supports
Cloudflare R2 without an additional package. In Cloudflare, create a private
R2 bucket and a bucket-scoped API token with **Object Read & Write** permission.
Then set these deployment secrets (and local `.env` values when needed):

```dotenv
S3_BUCKET=stackhr-documents
S3_REGION=auto
S3_ENDPOINT=https://<CLOUDFLARE_ACCOUNT_ID>.r2.cloudflarestorage.com
S3_ACCESS_KEY_ID=<R2_ACCESS_KEY_ID>
S3_SECRET_ACCESS_KEY=<R2_SECRET_ACCESS_KEY>
S3_FORCE_PATH_STYLE=false
```

Keep the bucket private. The storage adapter uploads objects using the S3 API;
application routes should issue time-limited download URLs rather than exposing
the bucket or its credentials to a browser. Cloudflare documents the required
endpoint format and S3 SDK configuration in its [R2 S3 guide](https://developers.cloudflare.com/r2/get-started/s3/) and [AWS SDK v3 example](https://developers.cloudflare.com/r2/examples/aws/aws-sdk-js-v3/).

### Authentication

Authentication is managed by the backend using PostgreSQL-backed sessions. The
API supports an HTTP-only `stackhr_session` cookie and `Authorization: Bearer`
tokens. Routes are available under `/v1/api/auth`:

```text
POST /v1/api/auth/business/signup
POST /v1/api/auth/business/register
POST /v1/api/auth/business/verify-email
POST /v1/api/auth/business/resend-verification
POST /v1/api/auth/business/login
POST /v1/api/auth/admin/login
GET  /v1/api/auth/me
POST /v1/api/auth/logout
GET  /v1/api/stackhr-admin/me
```

Business registration creates the initial organization and makes the user its
business owner. StackHR admin accounts are not publicly registered; configure
`STACKHR_ADMIN_EMAIL`, `STACKHR_ADMIN_PASSWORD`, and optionally
`STACKHR_ADMIN_NAME` to bootstrap the first platform admin during application
startup.

Business signup and company onboarding endpoint contracts are documented in
[Business Signup API](docs/business-signup-api.md). The
[People API endpoint plan](docs/people-api.md) covers Employees, Leave, Documents,
Organization, and employee Onboarding, distinguishing existing routes from
proposed contracts.

## Project setup

```bash
$ pnpm install
```

## Compile and run the project

```bash
# development
$ pnpm run start

# watch mode
$ pnpm run start:dev

# production mode
$ pnpm run start:prod
```

## Run tests

```bash
# unit tests
$ pnpm run test

# e2e tests
$ pnpm run test:e2e

# test coverage
$ pnpm run test:cov
```

## Deployment

Railway must provide a non-empty `DATABASE_URL`. The application listens on
Railway's injected `PORT` and binds to `0.0.0.0` by default, so no fixed public
port is required. Use `pnpm run build` as the build command and
`pnpm run start:prod` as the start command. After deployment, verify
`https://api.stackhr.app/` and API routes under `/v1/api`.

When you're ready to deploy your NestJS application to production, there are some key steps you can take to ensure it runs as efficiently as possible. Check out the [deployment documentation](https://docs.nestjs.com/deployment) for more information.

If you are looking for a cloud-based platform to deploy your NestJS application, check out [Mau](https://mau.nestjs.com), our official platform for deploying NestJS applications on AWS. Mau makes deployment straightforward and fast, requiring just a few simple steps:

```bash
$ pnpm install -g @nestjs/mau
$ mau deploy
```

With Mau, you can deploy your application in just a few clicks, allowing you to focus on building features rather than managing infrastructure.

## Resources

Check out a few resources that may come in handy when working with NestJS:

- Visit the [NestJS Documentation](https://docs.nestjs.com) to learn more about the framework.
- For questions and support, please visit our [Discord channel](https://discord.gg/G7Qnnhy).
- To dive deeper and get more hands-on experience, check out our official video [courses](https://courses.nestjs.com/).
- Deploy your application to AWS with the help of [NestJS Mau](https://mau.nestjs.com) in just a few clicks.
- Visualize your application graph and interact with the NestJS application in real-time using [NestJS Devtools](https://devtools.nestjs.com).
- Need help with your project (part-time to full-time)? Check out our official [enterprise support](https://enterprise.nestjs.com).
- To stay in the loop and get updates, follow us on [X](https://x.com/nestframework) and [LinkedIn](https://linkedin.com/company/nestjs).
- Looking for a job, or have a job to offer? Check out our official [Jobs board](https://jobs.nestjs.com).

## Support

Nest is an MIT-licensed open source project. It can grow thanks to the sponsors and support by the amazing backers. If you'd like to join them, please [read more here](https://docs.nestjs.com/support).

## Stay in touch

- Author - [Kamil Myśliwiec](https://twitter.com/kammysliwiec)
- Website - [https://nestjs.com](https://nestjs.com/)
- Twitter - [@nestframework](https://twitter.com/nestframework)

## License

Nest is [MIT licensed](https://github.com/nestjs/nest/blob/master/LICENSE).
