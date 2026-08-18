# Benchmarks

No benchmark result is published yet. The repository separates budgets in `QUALITY_TARGETS.md` from measurements.

Run:

```sh
npm run benchmark
```

The command writes `benchmark-results.json` with the Node version, platform, iteration counts, and observed durations for pure color conversion, URL sanitation, profile resolution, and filter compilation. The file is ignored because results are host-specific; CI uploads it as an artifact.

Safari DOM startup, popup rendering, memory, and battery behavior require macOS Safari and physical iPhone/iPad verification. Linux numbers must not be presented as those results.

