# StackHR Backend API

> Multi-tenant People, Payroll, Nigerian Statutory Compliance, and Spend Management platform for African SMEs.

[![CI Status](https://github.com/StackHR-HQ/stackhr-be/actions/workflows/main-ci.yml/badge.svg?branch=main)](https://github.com/StackHR-HQ/stackhr-be/actions/workflows/main-ci.yml)
[![Node.js Version](https://img.shields.io/badge/node-%3E%3D20.0.0-brightgreen.svg)](https://nodejs.org)
[![NestJS](https://img.shields.io/badge/framework-NestJS%2011-ea2845.svg)](https://nestjs.com)
[![Prisma](https://img.shields.io/badge/orm-Prisma%207-2d3748.svg)](https://www.prisma.io)
[![PostgreSQL](https://img.shields.io/badge/database-PostgreSQL-336791.svg)](https://www.postgresql.org)
[![License](https://img.shields.io/badge/license-UNLICENSED-red.svg)](<>)

---

## 1. System Architecture

StackHR is architected as an enterprise-grade **Modular Monolith** built on NestJS and PostgreSQL, designed to eliminate single points of failure, prevent double-spending on financial operations, and provide end-to-end distributed observability.

### 1.1 High-Level System Topology

```mermaid
flowchart TB
    subgraph Clients["Clients & Upstream Ingress"]
        FE["StackHR React/Vite Frontend<br/>(SPA)"]
        ADMIN["Platform Admin Portal"]
        PROM["Prometheus / Grafana Agent<br/>(Metrics Scraper)"]
    end

    subgraph Edge["Security & Ingress Layer"]
        HELMET["Helmet HTTP Hardening"]
        CORS["Strict CORS Filter"]
        PREFIX["Global Route Prefix<br/>(/v1/api & /metrics)"]
    end

    subgraph CoreEngine["StackHR Modular Monolith (NestJS)"]
        subgraph Pipeline["Zero-Trust Request Processing Pipeline"]
            ALS["1. RequestContextMiddleware<br/>(AsyncLocalStorage & OTel Traceparent)"]
            THROTTLE["2. ThrottlerGuard<br/>(Sliding Window Rate Limiter)"]
            AUTH["3. AuthGuard & RolesGuard<br/>(Stateful DB Sessions & RBAC)"]
            METRICS_INT["4. MetricsInterceptor<br/>(Latency Histograms & Status Counters)"]
            TENANT["5. TenantInterceptor<br/>(Strict organizationId Isolation)"]
            IDEM["6. IdempotencyInterceptor<br/>(Atomic Lease & Replay Short-circuit)"]
            VAL["7. Global ValidationPipe<br/>(class-validator DTO Whitelisting)"]
        end

        subgraph BoundedContexts["Domain Bounded Contexts"]
            AUTH_MOD["Auth & Users"]
            PEOPLE_MOD["People, Teams & Onboarding"]
            PAYROLL_MOD["Payroll Calculation & Execution"]
            PENSION_MOD["Nigerian Pension & PenCentral"]
            SPEND_MOD["Spend, Expenses & Advances"]
            LEAVE_MOD["Leave Policies & Balances"]
            APPROVAL_MOD["Generic Polymorphic Approvals"]
            ADMIN_MOD["Platform Admin & DLQ Operations"]
        end

        subgraph ReliabilityLayer["Production Reliability & Resilience Engine"]
            PINO["Structured Pino Logger<br/>(Automated PII/Credential Redaction)"]
            CB["Circuit Breaker Engine<br/>(Closed / Open / Half-Open)"]
            RETRY["Exponential Backoff & Full Jitter"]
            OUTBOX_PROC["Outbox Background Processor<br/>(3s Durable Poller)"]
            METRICS_SVC["Prometheus Metrics Registry<br/>(prom-client)"]
        end
    end

    subgraph DataTier["Data Tier & External Services"]
        DB[("PostgreSQL Database<br/>(Neon Serverless / RDS)")]
        R2[("Cloudflare R2 Storage<br/>(Documents, Payslip PDFs)")]
        PENCENTRAL["PenCentral Partner API<br/>(PenCom Validation & Remittance)"]
        SENDBYTE["SendByte Email Gateway<br/>(Transactional Notifications)"]
    end

    %% Client traffic
    FE --> Edge
    ADMIN --> Edge
    PROM -->|Scrape /metrics| Edge

    Edge --> Pipeline
    Pipeline --> BoundedContexts

    %% Domain modules interact with Reliability
    BoundedContexts <--> ReliabilityLayer
    BoundedContexts --> DB

    %% Outbox processing
    OUTBOX_PROC --> DB
    OUTBOX_PROC -.->|Asynchronous Dispatch| SENDBYTE

    %% External Resilient clients
    PENSION_MOD --> CB
    CB --> RETRY
    RETRY -->|HTTPS Request with 15s Timeout| PENCENTRAL
    PEOPLE_MOD --> R2
```

---

### 1.2 End-to-End Request Lifecycle Flow

Every inbound request flows through a 7-stage interceptor and guard pipeline before reaching domain business logic:

```mermaid
sequenceDiagram
    autonumber
    actor Client as Frontend Client
    participant ALS as RequestContextMiddleware
    participant Metrics as MetricsInterceptor
    participant Tenant as TenantInterceptor
    participant Idem as IdempotencyInterceptor
    participant Service as Domain Service (e.g., Payroll)
    participant Outbox as Transactional Outbox
    participant DB as PostgreSQL
    participant Filter as GlobalExceptionFilter

    Client->>ALS: POST /v1/api/payroll/runs/:id/execute<br/>Headers: Idempotency-Key, traceparent
    Note over ALS: Allocates AsyncLocalStorage Store<br/>Extracts or generates correlationId & traceId

    ALS->>Metrics: Starts high-precision timer (hrtime.bigint)
    Metrics->>Tenant: Validates authenticated user's organizationId

    alt Missing or Mismatched Tenant Context
        Tenant-->>Filter: 403 Forbidden (Cross-tenant access blocked)
        Filter-->>Client: Error Envelope with correlationId & traceId
    end

    Tenant->>Idem: Checks @Idempotent({ required: true })

    alt Idempotency Key Replayed
        Idem->>DB: Query IdempotencyKey
        DB-->>Idem: Record found (status: COMPLETED)
        Idem-->>Client: Cached Response [200 OK]<br/>Header: Idempotent-Replayed: true
    else First-time Execution
        Idem->>DB: Atomically reserve lease (status: IN_PROGRESS)
        Idem->>Service: Forward request to domain logic

        activate Service
        Note over Service: Executes within DB Transaction
        Service->>DB: Update PayrollRun state (PROCESSING)
        Service->>Outbox: createEvent({ eventType: 'payroll.executed', payload })
        DB-->>Service: Transaction Committed
        deactivate Service

        Service-->>Idem: Response Payload
        Idem->>DB: Complete key (status: COMPLETED, cachedResponse)
        Idem-->>Metrics: Request Success
        Metrics->>Client: 200 OK [Response Data]<br/>Headers: x-correlation-id, x-trace-id
    end
```

---

### 1.3 The 5 Reliability & Observability Pillars (ADR-013)

| Pillar                                        | Architecture & Implementation Details                                                                                                                                                                                                                                                                                                                     |
| --------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **1. Distributed Tracing & Logging**          | Uses Node's `AsyncLocalStorage` for context propagation (`correlationId`, `traceId`, `organizationId`, `userId`) across all async boundaries. Pino structured JSON logger with automated PII & credential redaction (`password`, `token`, `accountNumber`). W3C `traceparent` OpenTelemetry compatibility (`withSpan`).                                   |
| **2. Idempotency Engine & Concurrency Guard** | Atomic lease reservation (`IN_PROGRESS`), SHA-256 payload tampering detection (`422 Unprocessable Entity`), concurrent in-flight conflict detection (`409 Conflict`), crash recovery lease expiration, and instantaneous replay short-circuiting (`COMPLETED`, `Idempotent-Replayed: true`).                                                              |
| **3. Resilient External Communication**       | `CircuitBreaker` state machine (`CLOSED` → `OPEN` → `HALF_OPEN`) with 5-failure threshold and 30s recovery cooldown. `RetryPolicy` with exponential backoff and full jitter. 15-second `AbortController` timeout enforcement for upstream partner calls (PenCentral, Banking Rails).                                                                      |
| **4. Transactional Outbox Pattern & DLQ**     | Atomic persistence of domain events (`outbox_event`) within PostgreSQL business transactions. An asynchronous poller (`OutboxProcessor`) processes pending events on a 3s interval with exponential retry backoff. Poison messages exceeding 5 retries are quarantined to `dead_letter_event` with stack traces for platform admin inspection and replay. |
| **5. Production Metrics & Health Probes**     | `prom-client` registry exposing Prometheus metrics at `/metrics` with route parameter normalization (`:id`) to prevent cardinality explosion. Captures P50/P90/P95/P99 latency histograms, HTTP status counters, circuit breaker states, and DLQ depth. Deep `/health` probe verifies database ping latency and process memory (Heap/RSS).                |

---

### 1.4 Multi-Tenant Data Model

```mermaid
erDiagram
    ORGANIZATION ||--o{ USER : "has members"
    ORGANIZATION ||--o{ EMPLOYEE : "employs"
    ORGANIZATION ||--o{ PAYROLL_RUN : "executes"
    ORGANIZATION ||--o{ APPROVAL_REQUEST : "manages"
    ORGANIZATION ||--o{ OUTBOX_EVENT : "emits"
    ORGANIZATION ||--o{ DEAD_LETTER_EVENT : "quarantines"
    ORGANIZATION ||--o{ IDEMPOTENCY_KEY : "leases"

    EMPLOYEE ||--o{ PAYSLIP : "receives"
    PAYROLL_RUN ||--o{ PAYROLL_ITEM : "contains"
    PAYROLL_RUN ||--o{ PENSION_REMITTANCE_SCHEDULE : "generates"

    ORGANIZATION {
        string id PK
        string name
        string slug UK
    }

    IDEMPOTENCY_KEY {
        string id PK
        string organizationId FK
        string key
        string status "IN_PROGRESS | COMPLETED | FAILED"
        string requestHash
        datetime lockedUntil
    }

    OUTBOX_EVENT {
        string id PK
        string organizationId FK
        string eventType
        json payload
        string status "PENDING | PROCESSING | PROCESSED | FAILED"
        int retryCount
        datetime nextRetryAt
    }

    DEAD_LETTER_EVENT {
        string id PK
        string organizationId FK
        string originalId
        string eventType
        string failureReason
        text stackTrace
    }
```

---

### 1.5 Banking & Payments Architecture (Anchor BaaS Integration)

StackHR integrates with [Anchor](https://docs.getanchor.co) (CBN-regulated Banking-as-a-Service & Payments API infrastructure) to power automated Nigerian banking operations, virtual accounts, and real-time payroll disbursement. In adherence to **ADR-001**, all payment and banking rails are isolated within a dedicated `BankingModule` bounded context:

```mermaid
flowchart TD
    subgraph Core HR & Payroll Domains
        EMP[Employees Module]
        ME[Self-Service Me Module]
        PAY[Payroll Module]
        SPD[Spend & Reimbursements Module]
    end

    subgraph Banking Bounded Context
        BC[BankingController]
        BS[BankingService]
        AC[AnchorClient]
        RS[ResilienceService - CircuitBreaker & Retry]
        WC[AnchorWebhookController]
        WG[AnchorWebhookGuard - HMAC-SHA1]
    end

    subgraph External Anchor Rails
        A_BANK[Anchor Banks & Account Verification]
        A_ACC[Anchor Deposit Accounts / NUBAN]
        A_TRF[Anchor Single & Bulk NIP Transfers]
        A_CARD[Anchor Card Issuing]
    end

    EMP -->|Verify Bank Info| BS
    ME -->|Verify Bank Info| BS
    PAY -->|Funding Check & Bulk Payout| BS
    SPD -->|Disburse Advance / Claim| BS

    BS --> AC
    AC --> RS
    RS --> A_BANK
    RS --> A_ACC
    RS --> A_TRF
    RS --> A_CARD

    A_ACC -->|deposit.successful| WC
    A_TRF -->|bulkTransfer.completed| WC
    A_TRF -->|nip.transfer.successful| WC

    WC --> WG
    WC -->|Domain Events via EventEmitter2| PAY
    WC -->|Domain Events via EventEmitter2| BS
```

---

## 2. Getting Started

### 2.1 Prerequisites

- Node.js `>= 20.0.0`
- PostgreSQL `>= 15` (or Neon Serverless PostgreSQL)
- Yarn (`1.22+` / Classic) — strictly Yarn is used for this project

### 2.2 Environment Configuration

Copy `.env.example` to `.env` and fill in the necessary configuration:

```bash
cp .env.example .env
```

Essential variables:

```bash
PORT=3001
FRONTEND_URL="http://localhost:3000,http://localhost:5173"
DATABASE_URL="postgresql://user:password@localhost:5432/stackhr_dev?schema=public"
AUTH_SECRET="development-auth-secret-key-32b-min"
ENCRYPTION_KEY="development-secret-encryption-key-32b"
```

### 2.3 Installation & Database Setup

```bash
# Install dependencies
yarn install

# Generate Prisma Client types
yarn db:generate

# Synchronize database schema (non-destructive)
yarn db:push
```

### 2.4 Running the Application

```bash
# Development (watch mode with Pino pretty-printing)
yarn start:dev

# Production build
yarn build
yarn start:prod
```

---

## 3. Testing & Code Quality

The repository includes a comprehensive unit and integration test suite covering all modules, idempotency workflows, circuit breakers, and outbox mechanics:

```bash
# Run full test suite (70 test suites, 482 tests)
yarn test

# Run ESLint & code formatting
yarn lint
yarn format
```

---

## 4. Operational Endpoints & Observability

| Endpoint                                      | Method | Auth / Role      | Description                                                                                                   |
| --------------------------------------------- | ------ | ---------------- | ------------------------------------------------------------------------------------------------------------- |
| `/health` or `/v1/api/health`                 | `GET`  | Public           | Readiness probe reporting database latency, process memory (heap/RSS), circuit breaker states, and DLQ depth. |
| `/metrics` or `/v1/api/metrics`               | `GET`  | Public / Scraper | Raw Prometheus metrics scrape endpoint (P50/P90/P95/P99 latency histograms, request counters, DLQ gauge).     |
| `/v1/api/stackhr-admin/outbox/dlq`            | `GET`  | `STACKHR_ADMIN`  | Inspect dead-lettered outbox domain events requiring operator intervention.                                   |
| `/v1/api/stackhr-admin/outbox/dlq/:id/replay` | `POST` | `STACKHR_ADMIN`  | Replay a poisoned event back into the Transactional Outbox queue.                                             |

---

## 5. API Documentation

Interactive Postman documentation is maintained in the repository:

- **Collection**: [docs/postman/StackHR.postman_collection.json](file:///home/chukwuemeka/Documents/StackHR/Backend/stackhr-be/docs/postman/StackHR.postman_collection.json)
- **Environment**: [docs/postman/StackHR.postman_environment.json](file:///home/chukwuemeka/Documents/StackHR/Backend/stackhr-be/docs/postman/StackHR.postman_environment.json)

---

## 6. Architecture Decisions (ADRs)

Key architectural decisions are formally documented in [docs/DECISIONS.md](file:///home/chukwuemeka/Documents/StackHR/Backend/stackhr-be/docs/DECISIONS.md):

- **ADR-001**: Modular Monolith Architecture
- **ADR-002**: Multi-Tenancy Strategy (Shared PostgreSQL with strict interceptor isolation)
- **ADR-003**: Generic Polymorphic Approvals Engine
- **ADR-004**: Payroll Funding & Attestation Mechanics
- **ADR-007**: Stateful Database Sessions vs JWT
- **ADR-008**: Argon2id Password Hashing
- **ADR-011**: AES-256-GCM Field-Level Sensitive Data Encryption
- **ADR-012**: Nigerian Statutory Pension Remittance (PenCentral Partner API)
- **ADR-013**: System Reliability & Production Observability Engine
