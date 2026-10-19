# Staff AI service scope correction

The owner clarified that the App submission changes apply to customer App use. Staff report extraction and nutrition draft generation remain staff service workflows with human review, and must not depend on customers operating an App setting.

Staff authentication now establishes a separate asynchronous service scope. Only Qwen health processing with an identified patient in the authenticated institution uses that scope. Client-supplied actor IDs, report IDs, and tenant IDs alone do not establish it. Existing staff route authorization, tenant isolation, budget limits and human review remain in force. The service scope does not create or backfill customer consent records.

Queued report jobs restore the scope from their persisted initiating staff actor only after validating the actor's current role, status, institution and staff channel. Jobs without a valid staff initiator retain the customer consent path. Customer App calls, speech and other providers retain their consent checks.

This corrects the earlier release note's blanket application of the App consent switch to staff workflows. It is an application scope change, not a determination that manual review constitutes consent or a legal determination about third-party processing. Published disclosure wording should be reviewed separately for consistency; no customer authorization records are fabricated.

Validation: staff nutrition/report calls, concurrent customer requests, foreign/missing patients, forged budget actor metadata, other providers, speech, and queued-job restoration are covered without sending real customer data to a model provider. Deployment status is recorded by the release receipt.
