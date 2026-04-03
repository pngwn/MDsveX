# Database Performance Metrics

| Query | Avg (ms) | P95 (ms) | P99 (ms) | Max (ms) | Count | Errors | Cache Hit |
| :--- | ---: | ---: | ---: | ---: | ---: | ---: | :---: |
| SELECT users | 2.3 | 8.1 | 15.4 | 234.0 | 1482933 | 12 | 94.2% |
| SELECT orders | 5.7 | 18.3 | 42.1 | 512.0 | 892441 | 3 | 87.1% |
| INSERT order | 3.1 | 12.0 | 28.5 | 189.0 | 234112 | 0 | — |
| UPDATE inventory | 4.8 | 15.2 | 35.8 | 445.0 | 112834 | 7 | — |
| DELETE expired | 8.2 | 22.1 | 55.3 | 678.0 | 45221 | 1 | — |
| JOIN user_orders | 12.4 | 38.5 | 89.2 | 1023.0 | 389221 | 22 | 72.3% |
| AGGREGATE daily | 45.2 | 112.3 | 234.5 | 2048.0 | 8640 | 0 | 99.1% |
| FULL TEXT search | 18.7 | 52.1 | 128.4 | 890.0 | 67332 | 5 | 45.8% |
| GEO proximity | 22.1 | 68.4 | 145.2 | 1200.0 | 34221 | 2 | 38.2% |
| BATCH insert | 15.3 | 42.8 | 98.1 | 756.0 | 12445 | 0 | — |

## Endpoint Latencies

| Endpoint | Method | Avg (ms) | P50 (ms) | P95 (ms) | P99 (ms) | RPM | Error Rate |
| :--- | :---: | ---: | ---: | ---: | ---: | ---: | ---: |
| /api/users | GET | 12.3 | 8.1 | 35.2 | 82.1 | 24500 | 0.02% |
| /api/users/:id | GET | 5.1 | 3.2 | 15.8 | 38.4 | 18200 | 0.01% |
| /api/users | POST | 18.5 | 12.4 | 48.2 | 112.3 | 3400 | 0.15% |
| /api/users/:id | PUT | 15.2 | 10.1 | 42.1 | 95.8 | 2800 | 0.08% |
| /api/users/:id | DELETE | 8.4 | 5.2 | 22.3 | 55.1 | 450 | 0.04% |
| /api/orders | GET | 22.1 | 15.3 | 58.4 | 135.2 | 12300 | 0.05% |
| /api/orders | POST | 35.8 | 24.2 | 85.1 | 198.4 | 4500 | 0.22% |
| /api/orders/:id | GET | 8.2 | 5.5 | 22.8 | 52.3 | 28400 | 0.01% |
| /api/search | GET | 45.2 | 32.1 | 112.5 | 245.8 | 8900 | 0.12% |
| /api/inventory | GET | 15.8 | 10.2 | 42.5 | 98.2 | 6700 | 0.03% |
| /api/inventory | PUT | 12.1 | 8.4 | 32.1 | 75.4 | 2200 | 0.18% |
| /api/analytics | GET | 82.3 | 55.2 | 195.8 | 445.2 | 1200 | 0.35% |
| /api/reports | GET | 125.4 | 88.2 | 285.1 | 612.3 | 350 | 0.42% |
| /api/auth/login | POST | 28.5 | 18.2 | 65.4 | 152.1 | 5600 | 1.20% |
| /api/auth/token | POST | 5.2 | 3.1 | 12.8 | 28.5 | 15200 | 0.08% |
| /api/webhooks | POST | 42.1 | 28.5 | 98.2 | 225.4 | 890 | 0.55% |

## Cache Statistics

| Cache Layer | Size | Hit Rate | Evictions/hr | Avg TTL | Memory |
| :--- | ---: | ---: | ---: | ---: | ---: |
| L1 (in-process) | 1,024 | 98.5% | 120 | 60s | 256 MB |
| L2 (Redis) | 50,000 | 92.3% | 2,400 | 300s | 4 GB |
| L3 (CDN edge) | 500,000 | 85.1% | 8,500 | 3600s | 128 GB |
| Session store | 25,000 | 99.2% | 450 | 1800s | 2 GB |
| Query cache | 10,000 | 78.4% | 3,200 | 120s | 1 GB |
| Rate limiter | 100,000 | 99.9% | 15,000 | 60s | 512 MB |

## Error Breakdown

| Error Code | Count | Percentage | Top Endpoint | Recovery |
| :---: | ---: | ---: | :--- | :---: |
| 400 | 12,453 | 35.2% | /api/users POST | auto |
| 401 | 8,921 | 25.2% | /api/auth/login | retry |
| 403 | 2,145 | 6.1% | /api/admin | manual |
| 404 | 5,832 | 16.5% | /api/users/:id GET | ignore |
| 409 | 1,234 | 3.5% | /api/orders POST | retry |
| 422 | 2,567 | 7.3% | /api/inventory PUT | auto |
| 429 | 1,892 | 5.3% | /api/search GET | backoff |
| 500 | 234 | 0.7% | /api/reports GET | alert |
| 502 | 45 | 0.1% | /api/webhooks POST | retry |
| 503 | 12 | 0.0% | /api/analytics GET | wait |

## Deployment History

| Date | Version | Duration | Status | Rollback | Changes | Tests |
| :--- | :---: | ---: | :---: | :---: | ---: | ---: |
| 2024-01-15 | v2.14.0 | 4m 22s | success | no | 142 | 1,834 |
| 2024-01-12 | v2.13.2 | 3m 58s | success | no | 23 | 1,821 |
| 2024-01-10 | v2.13.1 | 5m 12s | rolled back | yes | 8 | 1,819 |
| 2024-01-08 | v2.13.0 | 4m 45s | success | no | 89 | 1,815 |
| 2024-01-05 | v2.12.3 | 3m 32s | success | no | 15 | 1,802 |
| 2024-01-03 | v2.12.2 | 4m 08s | success | no | 31 | 1,798 |
| 2024-01-02 | v2.12.1 | 6m 15s | rolled back | yes | 5 | 1,795 |
| 2023-12-28 | v2.12.0 | 4m 55s | success | no | 112 | 1,790 |
| 2023-12-22 | v2.11.4 | 3m 48s | success | no | 18 | 1,778 |
| 2023-12-20 | v2.11.3 | 4m 12s | success | no | 42 | 1,772 |
