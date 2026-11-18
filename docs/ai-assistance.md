# AI assistance decision record

## 2026-11-18 — MongoDB source archive

I developed the minimal source-document archive with Codex assistance. I defined
the scope and explicitly authorized Codex to inspect the current checkout, generate
the implementation under my direction and verify it. Codex ran the automated checks;
I performed the manual demonstration and reviewed the implementation. I prefer
manual, step-by-step implementation for subsequent work; direct code generation
for this feature was an explicit exception, not a permanent mode change.

Accepted decision: store whole batches, matching the current importer's transaction
boundary, rather than introducing per-game document processing, a queue or a separate
service. Use the official MongoDB driver instead of adding an ODM. PostgreSQL/JSONB
would be operationally simpler, but MongoDB is an intentional learning objective.

Evidence: seven new unit tests and nine real-database tests cover validation, guards,
archive uniqueness, stable pagination, replay, PostgreSQL state, rollback and outage
recovery. The complete unit suite (31), existing e2e suite (25), build and lint passed.
A simulated mid-transaction transformation failure is distinguished from the separate
real PostgreSQL outage scenario. Tests do not prove concurrent imports or exactly-once
processing. Replaying an older batch can overwrite newer content.

Rejected extension: no dual-database atomicity, automatic worker/retry coordination,
HTTP administrative endpoint or MongoDB migration of existing catalog records.
I completed the manual demonstration on 2026-11-18: I initialized development MongoDB
and used the CLI to store, deduplicate, retrieve and list the synthetic batch.
Repeated storage returned the same document ID/hash. The first replay created
three games; the second returned three unchanged, with no creations or updates.
A read-only PostgreSQL query confirmed three source records, linked game IDs and
content hashes. These observations verify this sequential synthetic flow, not
concurrent import safety, exactly-once processing or cross-database atomicity.

On 2026-11-18, I confirmed completion of my human review of the implementation and
requested that it be recorded. I reviewed it as the project author, with explanations
from Codex. I do not claim an additional review procedure or an independent reviewer.
My review does not establish production evidence or change the technical limitations
above.
