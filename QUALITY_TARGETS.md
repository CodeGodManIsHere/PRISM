# Quality targets

These are budgets, not measured results.

| Area | Target | Enforcement status |
| --- | --- | --- |
| Popup interactive | under 100 ms after DOM ready on reference device | measurement harness pending macOS/device run |
| Initial dark pass | under 50 ms for 1,000 ordinary nodes | deterministic fixture benchmark exists |
| Mutation batch | under 16 ms for 100 changed nodes | deterministic fixture benchmark exists |
| Filter compilation | under 1 s for 50,000 supported source rules on CI | stress test exists |
| Color cache | at most 2,048 entries | enforced in runtime code |
| Dirty-root queue | at most 128 roots before a bounded fallback | enforced in runtime code |
| Production compiler warnings | 0 | warnings-as-errors in project settings |
| Remote executable code | 0 | static validation |
| Telemetry endpoints | 0 | architecture and static validation |

Device-specific budgets must be measured on named hardware before release. A CI measurement is not a battery or real-device claim.

