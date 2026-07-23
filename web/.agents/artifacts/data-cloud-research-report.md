# Data Cloud in Salesforce Core — Complete Research Report

## 1. Core Modules (Verified from Internal Codesearch)

### Primary Data Cloud Modules (`core/`)

| Module | Purpose |
|--------|---------|
| **`datacloud`** | Legacy Data.com/Jigsaw module — company/contact data enrichment, D&B integration, clean rules |
| **`datacloud-api`** | Public API layer for the legacy datacloud module |
| **`datacloud-connect-api`** | Connect REST API definitions for Data Cloud |
| **`datacloud-udd`** | UDD (Universal Data Dictionary) definitions for datacloud entities |
| **`cdp-api`** | Core CDP/Data Cloud API — `CdpApiClientProvider`, `CdpTenantAdminService`, `CdpGdprService`, ID formats |
| **`cdp-impl`** | Core CDP implementation — segmentation, identity resolution, data governance, query engine, multi-org, OAuth, DataKits, gRPC client, Hyper/Query service protos |
| **`cdp-udd`** | UDD definitions for CDP — enums for DataKitType, SegmentStatus, TenantStatus, DataModelType, DataStoreType, etc. |
| **`cdp-udd-impl`** | UDD implementation — schema cache loading |
| **`cdp-connect-api`** | Connect API layer for CDP |
| **`cdp-smart-gates`** | Smart gates (Python-based) for CDP — automated quality/release gating |
| **`cdp-catalog-metadata-connect-impl`** | Catalog metadata Connect API implementation |
| **`einstein-datacloud-api`** | Einstein AI ↔ Data Cloud API — DataStream schemas, DLO/DMO mapping, Agentforce DataKit definitions |
| **`einstein-datacloud-impl`** | Einstein AI ↔ Data Cloud implementation — DataStream creation, Agentforce DataKit deployment, fine-tuning ML event processing |
| **`einstein-datacloud-utils`** | Utilities for Einstein-DataCloud — schema providers for Agentforce sessions, monitoring, feedback, RAG quality, digital wallet, batch predictions |
| **`vda-datacloud-runtime-api`** | VDA (Virtual Data Awareness) runtime API for Data Cloud — key qualifiers, fully-qualified keys |
| **`unified-analytics-impl`** | Tableau Next/Unified Analytics implementation — workspaces, dashboards, data alerts, collaboration, Tableau Next SQL jobs |
| **`unified-analytics-api`** | API layer for Unified Analytics — DQA service API, insights service API |
| **`unified-analytics-udd`** | UDD for unified analytics |
| **`unified-analytics-connect-api`** | Connect API for unified analytics |
| **`unified-analytics-dqa-api`** | Data Quality Analytics API |
| **`unified-analytics-dqa-impl`** | DQA implementation — semantic data model (SDM), data analysis, explore data actions |
| **`unified-analytics-dqa-connect-impl`** | DQA Connect API implementation |
| **`unified-analytics-dqa-udd`** | DQA UDD definitions |
| **`unified-analytics-agent-impl`** | Agent/AI integration for Unified Analytics |
| **`unified-analytics-slack-impl`** | Slack integration for Unified Analytics |
| **`unified-analytics-monitoring-api`** | Monitoring API for unified analytics |
| **`unified-analytics-monitoring-udd`** | Monitoring UDD |
| **`unified-analytics-business-user-impl`** | Business user features for unified analytics |
| **`unified-analytics-business-user-udd`** | Business user UDD |

### Modules That USE Data Cloud (Consumer modules)

| Module | How it uses Data Cloud |
|--------|----------------------|
| **`insights`** (CRMA) | `wave/elt/datacloud/` — ETL pipeline to/from Data Cloud, security predicate translation, query execution |
| **`insights-connect-api`** | Output/Input representations for Data Cloud recipe nodes |
| **`insights-udd`** | `DataCloudReporting.settings.xml` — settings/access checks for reporting on DC |
| **`einstein-gpt-segmentation-impl`** | Uses Data Cloud Agent topic for AI segmentation |
| **`agentforce-session-tracing-impl`** | Traces Agentforce sessions via Data Cloud |
| **`search/search-platform`** | Data Cloud DMO index configuration, entity search |
| **`marketing`** | LLM service integration with Data Cloud |
| **`identity-connect-api/impl`** | User mapping queries via Data Cloud |
| **`industries-*`** | Multiple industries modules query Data Cloud (offer management, compliance, RRA, nonprofit, etc.) |
| **`knowledge`** | Syncs knowledge articles with Data Cloud |
| **`privacy-center-impl`** | GDPR/privacy queries against Data Cloud |
| **`moduleapi`** | Module API definitions for datacloud |
| **`pde-unified-profile-shared`** | Shared profile data layer |

### UI Components (LWC modules)

| UI Module | Purpose |
|-----------|---------|
| `ui-datacloud-unified-profile-components` | Unified profile UI |
| `ui-cdp-components` | CDP setup, activation, partner configurations |
| `ui-unified-analytics-components` | Tableau Next analytics UI |
| `ui-einstein-gpt-components` | DataCloud selector for Einstein GPT |
| `ui-search-components` | Data Cloud search configuration |
| `ui-industries-*` | Industry-specific Data Cloud UIs |
| `ui-interaction-builder-components` | Data Cloud interaction builder |
| `ui-instrumentation-components` | Data Cloud event dispatcher |
| `ui-knowledge-components` | Sync with Data Cloud modal |
| `ui-agentforce-conversation-client-components` | Data Cloud agent config |

---

## 2. CDP-Impl Internal Architecture (from code structure)

### Key Sub-packages inside `cdp-impl`:

```
cdp-impl/
├── java/src/
│   ├── cdp/impl/
│   │   ├── tua/          # TUA (Tableau Unified Analytics) integration — MMF, assets, logging
│   │   ├── tab/          # Tableau connector (LCWrapper)
│   │   ├── mds/          # Metadata Service — schema management, canonical models
│   │   ├── ek/           # Enterprise Knowledge — rendering, metrics
│   │   ├── multiorg/     # Multi-org support — cross-org data governance
│   │   ├── segment/      # Segmentation engine
│   │   ├── caas/         # Cache-as-a-Service layer
│   │   ├── oauth/        # OAuth/trust for MC (Marketing Cloud) tenants
│   │   ├── gdpr/         # GDPR compliance
│   │   ├── ml/           # Machine Learning helper (MQ integration)
│   │   ├── dao/          # Data Access Objects
│   │   ├── mdapi/        # Metadata API — DataSource, DataPlatform, DataConnector
│   │   ├── c2c/          # Cloud-to-Cloud (MC API client)
│   │   ├── dataprism/    # Data Prism
│   │   ├── optimization/ # Query/pipeline optimization
│   │   ├── soqlbuilder/  # DataCloud SOQL builder
│   │   └── logs/         # Logging (P13n)
│   ├── cdp/api/
│   │   ├── segment/      # Segment API — DbtPipeline, Context
│   │   ├── limits/       # Rate limiting
│   │   ├── mds/          # MDS DevName utilities
│   │   └── model/data/   # Data record models
│   ├── cdp/udd/
│   │   └── dataaction/   # Data actions (Operators)
│   ├── cdp/metrics/      # CdpFeature metrics
│   ├── serialization/    # Serialization
│   └── versioning/       # CDP API versioning
├── proto/
│   ├── hyper_service.proto          # Hyper (Tableau's query engine) gRPC service
│   ├── query_service.proto          # Query service gRPC
│   ├── enterprise_knowledge.proto   # Enterprise Knowledge gRPC
│   └── error_details.proto
├── plsql/
│   ├── cCdpDataSpaces.sql
│   └── core/
│       ├── cCdpDloUtil.sql          # DLO utilities
│       ├── cCdpSqlUtil.sql          # SQL utilities
│       ├── cCdpTuaUtil.sql          # TUA utilities
│       ├── cCdpDataGovDmo.sql       # Data Governance - DMO
│       ├── cCdpDataGovSegment.sql   # Data Governance - Segments
│       ├── cCdpDataGovDataStream.sql
│       ├── cCdpDataGovDataGraph.sql
│       ├── cCdpDataGovDataShare.sql
│       ├── cCdpDataGovDataAction.sql
│       ├── cCdpDataGovActivation.sql
│       ├── cCdpDataGovDataMapping.sql
│       ├── cCdpDataGovDataTransform.sql
│       ├── cCdpDataGovSearchIndex.sql
│       ├── cCdpDataGovCrossOrg.sql
│       ├── cCdpDataGovDLOInstance.sql
│       ├── cCdpDataGovEinsteinStudio.sql
│       ├── cCdpDataKitLocking.sql
│       ├── cCdpDataGovQuickAttribute.sql
│       ├── cCdpDataGovSecondaryIndex.sql
│       └── cMktDataConnection.sql   # Marketing data connections
├── filebasedapex/
│   └── sfsqlquery/                  # SF SQL Query (Apex-based query engine)
├── apex/
│   └── sfdatakit/                   # Data Kit deployment
└── java/resources/
    ├── ai/                          # AI agent definitions (DataCloudAgent topics)
    ├── datakits/                    # DataKit XML definitions (Agentforce, Knowledge, Content)
    ├── acl/dmo/                     # ACL per DMO (Slack, Teams integrations)
    ├── ek/                          # Enterprise Knowledge fixtures
    ├── idp/                         # Identity resolution metadata schema
    ├── mc_sdm/                      # Marketing Cloud Semantic Data Model
    └── features/                    # Feature flags (EDC)
```

---

## 3. CRMA (CRM Analytics) ↔ Data Cloud Integration

### Key Integration Points (from code):

| Integration | Code Location | Description |
|------------|---------------|-------------|
| **CrmaDataCloudIntegrationHelper** | `insights/java/src/wave/moana/` | Main helper class bridging CRMA and Data Cloud |
| **CRMADataCloudIntegrationOrgPreference** | `insights/java/src/system/organization/setting/` | Org-level pref to enable CRMA↔DC integration |
| **WriteToDataCloudEnabledOrgPreference** | `insights/java/src/system/organization/setting/` | Enables writing from CRMA recipes to Data Cloud |
| **wave/elt/datacloud/** | `insights/java/src/wave/elt/datacloud/` | Full ELT (Extract-Load-Transform) pipeline |
| **InsightsDataLakeObjectService** | `insights/java/src/wave/elt/datacloud/` | Service to manage Data Lake Objects from CRMA |
| **SecurityPredicateTranslator** | `insights/java/src/wave/elt/datacloud/translator/` | Translates CRMA security predicates to Data Cloud RLS |
| **OutputDataCloudNodeRepresentation** | `insights-connect-api` | Recipe output node that writes to Data Cloud |
| **UpdateDataCloudObjectNodeRepresentation** | `insights-connect-api` | Updates existing Data Cloud objects from recipes |
| **DataCloudPipelineTestBase** | `insights/test/func/` | Functional test base for DC pipelines |
| **DataCloudRowCountReadinessCheck** | `insights/java/src/insights/api/template/` | Template readiness check — verifies DC data availability |
| **DataCloudAppAssociationTask** | `insights/java/src/wave/template/domino/t2a/` | Associates DC data with CRMA apps |
| **RecipeDataCloudOutputTypeEnum** | `insights-connect-api` | Enum for recipe output types targeting DC |
| **DataCloudReporting settings** | `insights-udd` | UDD settings enabling reporting on DC objects |

### CRMA → Data Cloud Flow:
```
CRMA Recipes/Dataflows
    │
    ├── OutputDataCloudNode (write processed data TO Data Cloud)
    │       Uses: InsightsDataLakeObjectService
    │       Creates: DLOs in Data Cloud lakehouse
    │
    ├── UpdateDataCloudObjectNode (update existing DMOs)
    │
    └── Read FROM Data Cloud (query DC objects in recipes)
            Uses: cdpFormattedQueryV3Executor / cdpFormattedQueryPaginatedExecutor
            SecurityPredicateTranslator → converts CRMA RLS to DC RLS

Data Cloud → CRMA:
    ├── DataCloudRowCountReadinessCheck (verify data exists before template deploy)
    ├── DataCloudAppAssociationTask (link DC datasets to CRMA apps)
    └── DataCloudReporting (report on DC objects inside CRMA)
```

---

## 4. Tableau Next (TabNext) ↔ Data Cloud Integration

### Architecture from Code:

The **`unified-analytics-*`** module family IS Tableau Next's core footprint in Salesforce core:

| Module | Role in TabNext |
|--------|----------------|
| `unified-analytics-impl` | Main implementation — workspaces, dashboards, viz, data alerts, Tableau Next SQL jobs |
| `unified-analytics-api` | DQA service API + insights service API |
| `unified-analytics-dqa-*` | **Data Quality Analytics** — the semantic model layer (SDM), data analysis, metric exploration |
| `unified-analytics-agent-impl` | AI/Agentforce integration |
| `unified-analytics-slack-impl` | Slack notifications for analytics |
| `unified-analytics-business-user-impl` | Self-service analytics for business users |
| `unified-analytics-monitoring-*` | Operational monitoring |

### Key Evidence of Native Data Cloud Integration:

1. **`cdp-impl/java/src/cdp/impl/tua/`** — TUA (Tableau Unified Analytics) package INSIDE cdp-impl:
   - `TuaUtils.java`, `CdpTuaLogger.java`, `MMFUtilsImpl.java`, `AllowedAssets.java`, `AssetInfo.java`, `Payload.java`
   - This proves TabNext is a **first-class citizen** inside the CDP platform code

2. **`cdp-impl/plsql/core/cCdpTuaUtil.sql`** — Database-level TUA utilities in CDP

3. **`cdp-impl/java/src/cdp/impl/tab/LCWrapper.java`** — Tableau connector wrapper inside CDP

4. **`cdp-impl/proto/hyper_service.proto`** — gRPC interface to Tableau's Hyper query engine, defined INSIDE cdp-impl

5. **`unified-analytics-impl/plsql/cTableauNextGenericSqlJob.sql`** — TabNext SQL execution via Data Cloud

6. **`unified-analytics-impl/java/resources/datakits/UserStreamDataKit.xml`** — DataKits (Data Cloud's packaging unit) for analytics

### External Services (Falcon/Microservices):

From `insights/tab-next-alerts` repo:
| Service | Infra |
|---------|-------|
| `tableau-next-adminui` | Admin UI service |
| `tableau-next-connectivity` | Data connectivity layer |
| `tableau-next-connectors` | Connector framework |
| `tableau-next-dashboards` | Dashboard rendering |
| `tableau-next-data-alerts` | Alerting system |
| `tableau-next-data-prep` | Data preparation |
| `tableau-next-homepage` | Homepage/landing |
| `tableau-next-pulse` | Pulse metrics |
| `tableau-next-sharing` | Sharing/collaboration |
| `tableau-next-thumbnails` | Asset thumbnails |
| `tableau-next-workspaces` | Workspace management |

### How TabNext Uses Data Cloud (Architecture):
```
┌─────────────────────────────────────────────────────────────┐
│                  TABLEAU NEXT (TabNext)                       │
│                                                              │
│  ┌─────────────┐  ┌───────────────┐  ┌─────────────────┐  │
│  │ Dashboards  │  │ Data Prep     │  │ Pulse Metrics   │  │
│  │ Workspaces  │  │ Connectors    │  │ Data Alerts     │  │
│  └──────┬──────┘  └───────┬───────┘  └────────┬────────┘  │
│         │                  │                    │            │
│         └──────────────────┼────────────────────┘            │
│                            │                                 │
│              unified-analytics-impl (core)                    │
│              unified-analytics-dqa-impl (SDM layer)          │
│                            │                                 │
├────────────────────────────┼─────────────────────────────────┤
│         DATA CLOUD PLATFORM (cdp-impl)                       │
│                            │                                 │
│  ┌─────────────────────────┼───────────────────────────┐    │
│  │    cdp/impl/tua/        │                           │    │
│  │    (TUA bridge layer)   │                           │    │
│  │    - MMFUtils           │                           │    │
│  │    - AllowedAssets      │                           │    │
│  │    - CdpTuaLogger       │                           │    │
│  └─────────────────────────┼───────────────────────────┘    │
│                            │                                 │
│  ┌─────────────────────────┼───────────────────────────┐    │
│  │  Query Layer            │                           │    │
│  │  - hyper_service.proto ←┘ (Tableau Hyper Engine)    │    │
│  │  - query_service.proto                              │    │
│  │  - DataCloudSoqlBuilder                             │    │
│  └─────────────────────────────────────────────────────┘    │
│                            │                                 │
│  ┌─────────────────────────┼───────────────────────────┐    │
│  │  Data Governance        │                           │    │
│  │  - DMO / DLO            │                           │    │
│  │  - Data Streams         │                           │    │
│  │  - Data Graphs          │                           │    │
│  │  - Segments             │                           │    │
│  │  - Identity Resolution  │                           │    │
│  └─────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────┘
```

---

## 5. What Data Cloud Does (Business Perspective)

### The Problem It Solves:
Enterprises have customer data scattered across 100s of systems — CRM, marketing tools, websites, mobile apps, POS, IoT devices. No single system has a complete picture of the customer.

### What Data Cloud Provides:

| Capability | Business Value |
|-----------|---------------|
| **Data Ingestion** | Connect any data source (APIs, files, streaming) into one platform |
| **Identity Resolution** | Merge duplicate records across systems into one "golden" customer profile |
| **Unified Profile** | 360-degree view of every customer — their interactions, purchases, preferences |
| **Segmentation** | Build audiences for targeted campaigns without SQL knowledge |
| **Calculated Insights** | Pre-compute business metrics (LTV, churn risk, engagement scores) |
| **Activation** | Push segments to any channel — email, ads, web personalization |
| **AI Grounding** | Provide real customer data context to Agentforce/Einstein AI |
| **Real-time** | Sub-second data updates for time-sensitive decisioning |
| **Data Governance** | Consent management, GDPR compliance, data sharing controls |
| **Zero-copy Partners** | Snowflake, Databricks, BigQuery can query DC data without moving it |

### Revenue Impact:
- Powers personalization → higher conversion rates
- Enables AI agents (Agentforce) to have full customer context
- Reduces data infrastructure costs (one platform vs. many)
- Compliance/trust — centralized consent and governance

---

## 6. Onboarding as LMTS into Data Cloud

### Recommended Learning Path:

#### Phase 1: Foundations (Week 1-2)
1. Understand the **data model** — DMO, DLO, Data Streams, Data Graphs
2. Study `cdp-udd` enums — they define the vocabulary (DataKitType, SegmentStatus, DataModelType, etc.)
3. Read `cdp-api` interfaces — understand the service contracts
4. Review the proto files (`hyper_service.proto`, `query_service.proto`) — understand the query layer

#### Phase 2: Deep Dive (Week 3-4)
5. Study `cdp-impl` sub-packages based on your target area:
   - **Query/Performance**: `optimization/`, `soqlbuilder/`, proto files
   - **Data Governance**: `plsql/core/cCdpDataGov*.sql`
   - **AI/Agentforce**: `einstein-datacloud-*` modules
   - **Multi-org**: `multiorg/`
   - **Analytics/TUA**: `tua/`, `unified-analytics-*`
6. Understand DataKits — the packaging/deployment unit for Data Cloud configurations

#### Phase 3: Cross-cutting (Week 5+)
7. Study CRMA integration (`insights/java/src/wave/elt/datacloud/`)
8. Study TabNext integration (`unified-analytics-impl`)
9. Understand the microservice layer (`tableau-next-*` Falcon services)
10. Review Enterprise Knowledge (`cdp-impl/java/src/cdp/impl/ek/`)

### Key Internal Repos:
| Repo | Content |
|------|---------|
| `gitcore.soma.salesforce.com/core-2206/core-264-public` | Core modules (cdp-*, unified-analytics-*, etc.) |
| `git.soma.salesforce.com/insights/tab-next-alerts` | TabNext microservice alerting |
| `git.soma.salesforce.com/insights/TUA-Apps-Dev-Tools` | Development tools & MCP servers |
| `git.soma.salesforce.com/insights/tableau-next-knowledge` | TabNext wiki/knowledge base |
| `git.soma.salesforce.com/a360/d360-skills` | Data 360 skills |

### Key Technologies to Know:
- **Java** (primary language for core modules)
- **Bazel** (build system)
- **gRPC/Protobuf** (service communication)
- **PL/SQL** (database procedures for data governance)
- **Spring Framework** (DI, configuration)
- **Tableau Hyper Engine** (columnar query engine)
- **Apex** (file-based Apex for customer-facing APIs)
- **LWC** (UI components)

### Slack Channels to Join:
- Look for: `#data-cloud-*`, `#cdp-*`, `#unified-analytics-*`, `#tableau-next-*`
