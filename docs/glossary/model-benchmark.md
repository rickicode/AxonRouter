# Model benchmark glossary

**Benchmark job**
One operator-started run. It has a selected set of providers, the accounts and models tested, the suite list, and one reviewer report at the end.

**Attempt**
One call for one account, one model, and one suite rep. This is the stored fact. Summaries are calculated from attempts.

**PONG gate**
The first suite. The model must reply with text containing `PONG`. Failing it skips coding, logic, and tool call for that account and model.

**Liveness**
Passed PONG reps divided by attempted PONG reps. `rate_limited` attempts are excluded from both counts.

**Rate limited**
An HTTP 429 or an upstream body that says the account or IP is temporarily limited. It is retried once later and is not a dead model.

**Format**
`json` when the gateway returns one JSON document. `sse` when it returns `data:` chunks. Both can be a success.

**Skipped**
A suite that does not apply, such as tool call on a provider that has no tools. It is not a failure and does not lower the score.

**Reviewer**
The model or combo selected before the run. It reads the finished job and writes one report. It does not replace measured results.

**Reviewer report**
The saved summary for one job: reviewer id, time, and text. A later run does not overwrite it.
