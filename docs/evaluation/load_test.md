# Load test (Blueprint §15.3)

Synthetic data only; results describe the host below, not production.

| Measure | Value |
|---|---|
| host | Windows 11, 8 CPUs, 16048 MB RAM |
| clinicians | 20 |
| recording_minutes | 30 |
| audio_mb_each | 13.7 |
| success_rate | 20/20 (100.0%) |
| wall_seconds | 4.9 |
| latency_s_median | 4.58 |
| latency_s_max | 4.86 |
| server_rss_idle_mb | 62 |
| server_rss_peak_mb | 282 |
| server_rss_after_mb | 105 |
| swap_used_before_mb | 78 |
| swap_used_after_mb | 78 |
| swap_in_out_mb | 0 |
| note | swap in/out counters are not reported by Windows; on a Linux processing host swap is disabled (docs/deploy.md), so the expected value is 0 and swap_used must be 0 |
