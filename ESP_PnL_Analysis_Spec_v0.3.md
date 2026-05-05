# Profit & Loss Analysis — Feature Spec (v0.2)

**Modul:** Shipment Dashboard
**Scope:** Air Shipment, perspektif TO (Transport Order)
**Tanggal:** 29 April 2026
**Changelog v0.2:** Disederhanakan berdasarkan klarifikasi user: relasi tabel sudah confirmed, cycle date pakai Complete Date, formula cost SMU sudah confirmed.

---

## 1. Tujuan Fitur

Memberikan visibility profit margin di level TO, AWB, route, vendor, dan periode penagihan untuk:
1. Tahu margin per shipment (TO → AWB → Invoice cycle).
2. Identifikasi route/vendor yang loss-making.
3. Reconcile estimasi internal vs angka invoice yang ditagihkan ke SPX.

---

## 2. Relasi Tabel (Confirmed)

```
                        ┌─────────────────────────────────┐
                        │  air_shipments_compileaircgk    │
                        │  (Fact: Revenue & Trip)         │
                        │  Granularity: 1 row = 1 TO      │
                        │                                 │
                        │  • to_number (PK)               │
                        │  • awb (FK) ──────────┐         │
                        │  • lt_number          │         │
                        │  • gross_weight       │         │
                        │  • amount_revenue     │         │
                        │  • additional_amount_packing_kayu│
                        │  • completed_time     │         │
                        └───────────────────────┼─────────┘
                                                │
                                                │ AWB (n:1)
                                                ▼
                        ┌─────────────────────────────────┐
                        │  air_shipments_smu_rate_cgk_spx │
                        │  (Booking flight)               │
                        │  Granularity: 1 row = 1 AWB     │
                        │                                 │
                        │  • awb (PK)                     │
                        │  • account ──┐                  │
                        │  • airlines ─┤                  │
                        │  • via ──────┼──┐               │
                        │  • dest ─────┘  │               │
                        │  • ra ───────────┼───────────┐  │
                        │  • sg            │           │  │
                        └──────────────────┼───────────┼──┘
                                           │           │
                  ┌────────────────────────┘           │
                  │ join (Vendor+Airlines+Origin+Dest) │
                  ▼                                    │
        ┌──────────────────────────┐                   │
        │  air_shipments_smu       │                   │
        │  (Cost SMU dim)          │                   │
        │                          │                   │
        │  • vendor                │                   │
        │  • airlines              │                   │
        │  • origin                │                   │
        │  • destination           │                   │
        │  • total_cost_smu_per_kg │                   │
        │  • admin_smu             │                   │
        │  • sg_out  ──────────────┼─────┐             │
        └──────────────────────────┘     │             │
                                         │             │
                                         ▼             ▼
                  ┌──────────────────────────┐  ┌──────────────────────┐
                  │  air_shipments_sg_outgoing│  │  air_shipments_ra    │
                  │                          │  │                      │
                  │  • sg_outgoing_name (PK) │  │  • ra_name (PK)      │
                  │  • rate                  │  │  • rate              │
                  │  • admin                 │  │  • admin             │
                  │  • ppn                   │  │  • ppn               │
                  └──────────────────────────┘  └──────────────────────┘
```

**Lookup chain:**
1. Mulai dari `compileaircgk.AWB` → join ke `smu_rate_cgk_spx` ambil (Account, Airlines, Via, Dest, RA, SG).
2. Pakai (Account, Airlines, Via, Dest) → join ke `smu` ambil (Total Cost SMU/Kg, Admin SMU, SG Out).
3. Pakai `smu_rate_cgk_spx.RA` → join ke `ra` ambil (Rate, Admin, PPN).
4. Pakai `smu.SG Out` → join ke `sg_outgoing` ambil (Rate, Admin, PPN).

---

## 3. Formula

### 3.1 Revenue per TO (verified ✅)

```
revenue_freight_per_to     = compileaircgk.amount_revenue
                           = gross_weight_to × rate_spx_after_pph_disc
revenue_packing_per_to     = compileaircgk.additional_amount_packing_kayu
revenue_total_per_to       = revenue_freight_per_to + revenue_packing_per_to
```

### 3.2 Cost per AWB

Di-hitung di level AWB, lalu dialokasi ke TO (lihat 3.3).

```
sum_gw_per_awb = SUM(gross_weight) FROM compileaircgk WHERE awb = X

-- Komponen 1: SMU (rate × kg + admin flat)
cost_smu_per_awb     = sum_gw_per_awb × smu.total_cost_smu_per_kg
                     + smu.admin_smu

-- Komponen 2: Regulated Agent
cost_ra_per_awb      = sum_gw_per_awb × ra.rate × (1 + ra.ppn)
                     + ra.admin

-- Komponen 3: SG Outgoing
cost_sg_out_per_awb  = sum_gw_per_awb × sg_outgoing.rate × (1 + sg_outgoing.ppn)
                     + sg_outgoing.admin

-- Total
cost_total_per_awb   = cost_smu_per_awb + cost_ra_per_awb + cost_sg_out_per_awb
```

**Verified pada `air_shipments_smu`:** Formula `total_cost_smu_per_kg` di Database Harga = `(Freight Rate + SC + FBC + MYC + Other) × (1 + PPN − Komisi)`. Match 100% di 157 row sample, jadi `total_cost_smu_per_kg` sudah include PPN dan Komisi. Cuma `Admin SMU` yang dipisah (flat per AWB).

**Special cases:**
| Trigger | Penanganan |
|---|---|
| `RA = "Include SMU"` atau `"Include SG BDL"` | `cost_ra_per_awb = 0` |
| `SMU.SG Out = "Include SMU"` | `cost_sg_out_per_awb = 0` (sudah bundled di SMU rate) |
| AWB tidak ketemu di `smu_rate_cgk_spx` | Surface as data quality issue, cost = NULL (jangan default 0) |
| Rate SMU/RA/SG tidak ketemu di Database Harga | Idem, surface NULL |

### 3.3 Alokasi Cost per AWB → per TO

Karena Admin SMU/RA/SG itu flat per AWB (bukan per kg), dan kita butuh P&L per TO, alokasinya by **weight share**:

```
weight_share_to = compileaircgk.gross_weight_to / sum_gw_per_awb

cost_to = cost_total_per_awb × weight_share_to
```

Konsekuensi:
- TO yang lebih berat → bear cost lebih besar (proportional). Wajar.
- Admin terbagi proporsional ke semua TO di AWB.

### 3.4 P&L per TO

```
gross_profit_to     = revenue_total_to − cost_to
gross_margin_pct_to = gross_profit_to / revenue_total_to
```

### 3.5 Invoice Cycle (confirmed: pakai Complete Date)

```sql
-- Computed column
cycle_date = (extra_fields->>'completed_time')::TIMESTAMP::DATE

cycle_period =
    TO_CHAR(cycle_date, 'YYYY-MM') ||
    CASE WHEN EXTRACT(DAY FROM cycle_date) <= 15 THEN '-1H' ELSE '-2H' END
```

Contoh: TO yang `completed_time = 2026-04-22 14:30` → `cycle_period = "2026-04-2H"`.

---

## 4. Sanity Check dengan Data Real

Hitungan end-to-end untuk **AWB 126-92225630** (88 TOs, SILI/Garuda CGK→BPN):

| Komponen | Nilai (IDR) |
|---|---|
| **Revenue** | |
| Freight = SUM(GW × Rate SPX) | 8,599,006.92 |
| Packing Kayu | 1,519,000.00 |
| **Total Revenue** | **10,118,006.92** |
| **Cost** | |
| SMU = 359.31 × 22,343.1 + 12,765 | 8,040,864.26 |
| RA = 359.31 × 800 × 1.11 + 0 (RA Avia CGK) | 319,067.28 |
| SG Outgoing | 0 (Include SMU) |
| **Total Cost** | **8,359,931.54** |
| **Gross Profit** | **1,758,075.38** |
| **Margin** | **17.38%** |

---

## 5. Open Question — Cost Basis Weight Column

Untuk lookup cost SMU/RA/SG, weight basis-nya pakai kolom mana?

| Opsi | Kolom | Semantic |
|---|---|---|
| A | `compileaircgk.gross_weight` (per TO, sum-up ke AWB) | Weight basis yang sama dengan revenue ke SPX (matched basis) |
| B | `smu_rate_cgk_spx.chwt_airlines` (langsung di level AWB) | Chargeable weight yang sebenarnya ditagih airline ke kita |

Kedua kolom ini bisa berbeda karena (a) **volumetric weight** — airline charge by `MAX(actual, volumetric)` dengan formula `(P × L × T) / 6000`, jadi parcel ringan tapi besar kena charge dimensional, dan (b) **min 10 Kg rounding** di sisi airline untuk parcel kecil.

**Implikasi pilihan:**
- **Pakai compile GW (A)** → Cost matched dengan revenue yang ditagih ke SPX. Margin merefleksikan "berapa yang kita untung dari yang di-passthrough ke customer". Tapi tidak menangkap selisih antara apa yang ditagih airline vs apa yang bisa di-charge ulang ke SPX.
- **Pakai chwt_airlines (B)** → Cost mencerminkan economic reality (yang benar-benar dibayar ke airline). Selisih dengan revenue jadi true gross profit.

**Rekomendasi:** Tampilkan **dua-duanya** di dashboard — sebut `Margin (Billing Basis)` pakai compile GW dan `Margin (Actual Basis)` pakai chwt_airlines. Selisih di antaranya = "weight gap" yang dimakan ESP. Decision tetap di tim Finance, tapi dua angka ini saling melengkapi untuk visibility yang utuh.

---

## 6. Data Quality Issues yang Ditemukan

Aku temuin beberapa naming inconsistency yang perlu di-handle di ETL/sync layer:

### 6.1 Case sensitivity di RA

| Di `smu_rate_cgk_spx.ra` | Di `ra.ra_name` |
|---|---|
| `RA Avia CGK` | `RA AVIA CGK` |

Solusi: lookup pakai `LOWER()` di kedua sisi, atau normalize saat sync.

### 6.2 Pricing yang missing

| Field | Value | Status |
|---|---|---|
| `smu_rate_cgk_spx.account` | `MLC` | ❌ Tidak ada di `smu` table |
| `smu_rate_cgk_spx.ra` | `RA BDL` | ❌ Tidak ada di `ra` table |
| `smu_rate_cgk_spx.ra` | `RA CMU` | ⚠️ Ada `CMU` (tanpa prefix "RA") di table — kemungkinan typo |
| `smu.sg_out` | `SG GADOM` | ⚠️ Ada `SG GA-DOM` di table — typo (dash hilang) |
| `smu.sg_out` | `Power Express` | ❌ Tidak ada di `sg_outgoing` |

**Action items:**
1. Validate sync layer surface warning kalau ada value di SMU RATE yang tidak ketemu di pricing table.
2. Dashboard tampilkan flag visual untuk TO/AWB yang punya cost = NULL karena lookup gagal.

### 6.3 Vendor mismatch antara CompileAirCGK dan SMU RATE

```
compileaircgk.vendor    : selalu "ESP"  (semua 288 row di sample)
smu_rate_cgk_spx.account: ESP, PRIME, SILI, MLC
```

`compileaircgk.vendor` kelihatannya **operator/handler** yang fixed, sementara `Account` di SMU RATE adalah **billing account** yang berbeda per AWB. Untuk lookup cost SMU **wajib pakai `Account` dari SMU RATE**, bukan VENDOR dari Compile.

Ini sudah benar di formula (Section 2), cuma perlu disampaikan ke developer biar gak salah.

### 6.4 Field `SG` di SMU RATE CGK SPX

Field ini kadang berisi nama RA (`RA BST`, `RA Avia CGK`), kadang null. Pertanyaan: **untuk apa field ini?** Apakah cuma metadata untuk tim Reservasi tracking, atau memang dipakai sebagai SG handler override?

**Rekomendasi:** Untuk MVP, **abaikan field ini**, pakai `smu.sg_out` saja sebagai source SG handler (sesuai instruksi user di klarifikasi).

---

## 7. Open Questions yang Masih Perlu Konfirmasi

| # | Pertanyaan | Default Asumsi |
|---|---|---|
| 1 | **Weight basis** untuk cost: compile GW atau chwt_airlines? (lihat §5) | Compile GW (per instruksi user) |
| 2 | Cost RA: rumusnya `GW × Rate × (1+PPN) + Admin`? PPN 11% di-apply, dan Admin flat? | Ya, asumsi default |
| 3 | Cost SG Outgoing: sama formula seperti RA? | Ya, asumsi default |
| 4 | Admin RA dan Admin SG: flat per AWB juga (sama seperti Admin SMU)? | Ya, asumsi default |
| 5 | SG Incoming (file Database Harga ada sheet ke-4 ini): masuk P&L atau di-skip karena di-handle SPX langsung? | Skip untuk MVP |
| 6 | Kalau cost lookup gagal (e.g. account `MLC` not in pricing): cost di-set NULL atau 0? | NULL (surface as data quality issue) |
| 7 | Min 10 Kg rule (tertulis di header invoice "Chargeable Weight (Min. 10 Kg)") — apakah berlaku di revenue calculation? | Tidak, karena `Amount Revenue = GW × Rate` exact (verified) |
| 8 | Discount/Deduction (yang ada di sheet `Deduction` invoice file): masuk MVP atau Phase 2? | Phase 2 |

---

## 8. Schema View `v_pnl_to`

```sql
CREATE OR REPLACE VIEW v_pnl_to AS
WITH
-- Step 1: Compile (Revenue + Trip metadata)
compile AS (
    SELECT
        extra_fields->>'to_number'                                        AS to_number,
        extra_fields->>'awb'                                              AS awb,
        (extra_fields->>'gross_weight')::NUMERIC                          AS gross_weight,
        (extra_fields->>'amount_revenue')::NUMERIC                        AS revenue_freight,
        COALESCE((extra_fields->>'additional_amount_packing_kayu')::NUMERIC, 0)
                                                                          AS revenue_packing,
        (extra_fields->>'completed_time')::TIMESTAMP                      AS completed_time,
        extra_fields->>'origin_station'                                   AS origin_region,
        extra_fields->>'destination_station'                              AS destination_region
    FROM air_shipments_compileaircgk
),
-- Step 2: AWB-level totals from compile
awb_totals AS (
    SELECT awb, SUM(gross_weight) AS sum_gw_per_awb
    FROM compile
    GROUP BY awb
),
-- Step 3: SMU RATE (booking + RA/SG handler refs)
booking AS (
    SELECT
        extra_fields->>'awb'                                              AS awb,
        extra_fields->>'account'                                          AS vendor,
        extra_fields->>'airlines'                                         AS airline,
        extra_fields->>'via'                                              AS via,
        extra_fields->>'dest'                                             AS dest,
        extra_fields->>'ra'                                               AS ra_name
    FROM air_shipments_smu_rate_cgk_spx
),
-- Step 4: SMU pricing lookup
smu_price AS (
    SELECT
        b.awb,
        (extra_fields->>'total_cost_smu_per_kg')::NUMERIC                 AS smu_rate_per_kg,
        (extra_fields->>'admin_smu')::NUMERIC                             AS smu_admin,
        extra_fields->>'sg_out'                                           AS sg_out_name
    FROM booking b
    LEFT JOIN air_shipments_smu s
      ON  s.extra_fields->>'vendor'      = b.vendor
      AND s.extra_fields->>'airlines'    = b.airline
      AND s.extra_fields->>'origin'      = b.via
      AND s.extra_fields->>'destination' = b.dest
),
-- Step 5: RA pricing lookup (case-insensitive)
ra_price AS (
    SELECT
        b.awb,
        COALESCE((r.extra_fields->>'rate')::NUMERIC, 0)  AS ra_rate,
        COALESCE((r.extra_fields->>'admin')::NUMERIC, 0) AS ra_admin,
        COALESCE((r.extra_fields->>'ppn')::NUMERIC, 0)   AS ra_ppn,
        b.ra_name
    FROM booking b
    LEFT JOIN air_shipments_ra r
      ON LOWER(r.extra_fields->>'ra_name') = LOWER(b.ra_name)
),
-- Step 6: SG Outgoing pricing lookup
sg_price AS (
    SELECT
        sp.awb,
        COALESCE((sg.extra_fields->>'rate')::NUMERIC, 0)  AS sg_rate,
        COALESCE((sg.extra_fields->>'admin')::NUMERIC, 0) AS sg_admin,
        COALESCE((sg.extra_fields->>'ppn')::NUMERIC, 0)   AS sg_ppn,
        sp.sg_out_name
    FROM smu_price sp
    LEFT JOIN air_shipments_sg_outgoing sg
      ON sg.extra_fields->>'sg_outgoing_name' = sp.sg_out_name
),
-- Step 7: Cost computation per AWB
awb_cost AS (
    SELECT
        a.awb,
        a.sum_gw_per_awb,
        -- Cost SMU (rate per kg × weight + flat admin)
        (a.sum_gw_per_awb * sp.smu_rate_per_kg + sp.smu_admin)            AS cost_smu,
        -- Cost RA (with PPN and admin), zero if "Include SMU"/"Include SG BDL"
        CASE
            WHEN LOWER(rp.ra_name) LIKE 'include%' THEN 0
            ELSE a.sum_gw_per_awb * rp.ra_rate * (1 + rp.ra_ppn) + rp.ra_admin
        END                                                               AS cost_ra,
        -- Cost SG Outgoing (with PPN and admin), zero if "Include SMU"
        CASE
            WHEN LOWER(sgp.sg_out_name) LIKE 'include%' THEN 0
            ELSE a.sum_gw_per_awb * sgp.sg_rate * (1 + sgp.sg_ppn) + sgp.sg_admin
        END                                                               AS cost_sg_out
    FROM awb_totals a
    LEFT JOIN smu_price sp ON sp.awb = a.awb
    LEFT JOIN ra_price rp  ON rp.awb = a.awb
    LEFT JOIN sg_price sgp ON sgp.awb = a.awb
)
-- Step 8: Allocate AWB cost to TO level by weight share
SELECT
    c.to_number,
    c.awb,
    c.completed_time,
    TO_CHAR(c.completed_time::DATE, 'YYYY-MM') ||
        CASE WHEN EXTRACT(DAY FROM c.completed_time) <= 15 THEN '-1H' ELSE '-2H' END
                                                                          AS cycle_period,
    c.origin_region,
    c.destination_region,
    b.vendor,
    b.airline,

    -- Weight
    c.gross_weight,
    ac.sum_gw_per_awb,
    (c.gross_weight / NULLIF(ac.sum_gw_per_awb, 0))                      AS weight_share,

    -- Revenue per TO
    c.revenue_freight,
    c.revenue_packing,
    (c.revenue_freight + c.revenue_packing)                              AS revenue_total,

    -- Cost AWB-level (for traceability/drilldown)
    ac.cost_smu                                                          AS cost_smu_awb,
    ac.cost_ra                                                           AS cost_ra_awb,
    ac.cost_sg_out                                                       AS cost_sg_out_awb,
    (ac.cost_smu + ac.cost_ra + ac.cost_sg_out)                          AS cost_total_awb,

    -- Cost TO-level (allocated)
    (ac.cost_smu + ac.cost_ra + ac.cost_sg_out)
        * (c.gross_weight / NULLIF(ac.sum_gw_per_awb, 0))                AS cost_to,

    -- P&L
    (c.revenue_freight + c.revenue_packing)
      - (ac.cost_smu + ac.cost_ra + ac.cost_sg_out)
        * (c.gross_weight / NULLIF(ac.sum_gw_per_awb, 0))                AS gross_profit_to

FROM compile c
JOIN awb_totals ac ON ac.awb = c.awb
LEFT JOIN booking b ON b.awb = c.awb;
```

Aggregat lain (di-build di atas `v_pnl_to`):
- `v_pnl_awb` — group by `awb`
- `v_pnl_cycle` — group by `cycle_period` (untuk reconcile dengan invoice)
- `v_pnl_route` — group by `(origin_region, destination_region)`
- `v_pnl_vendor` — group by `vendor`

---

## 9. Performance & Indexing

### 9.1 Sizing Estimasi

| Periode | Compile rows (TOs) | AWB unique |
|---|---|---|
| April 2026 (29 hari aktual) | 53,902 | ~3.8k |
| Per cycle (15 hari) | ~28,000 | ~2,000 |
| Setelah 1 tahun | ~700,000 | ~50,000 |
| Setelah 2 tahun | ~1.4M | ~100,000 |

Skala ini **kecil** untuk Postgres. Dashboard query biasanya filter cycle (~28k row), bukan full scan. Dengan indexing yang benar, target query latency <500ms achievable di sebagian besar view.

### 9.2 Strategi: Generated Columns + Regular Views (NOT Materialized)

Karena sync frequency 30 detik, **materialized view bukan pilihan tepat** — refresh setiap 30s akan eat CPU dan lock table. Strategi yang dipilih:

1. **Generated columns (STORED)** — extract hot fields dari `extra_fields` JSONB sekali saat insert/update, simpan sebagai kolom asli yang bisa di-index. Hilangkan JSONB extraction overhead di setiap query.
2. **B-tree index** di hot fields untuk filter dan join.
3. **Regular view** untuk `v_pnl_to` — Postgres planner push-down filter cycle, gabung dengan index = cukup cepat.
4. **Tidak pakai materialized view di MVP.** Escalation path: kalau perf masih jelek setelah testing (>2s), pertimbangkan materialized table khusus untuk **cost AWB-level** dengan refresh cycle 5 menit (cost lebih stabil dari revenue, OK kalau staleness 5 menit).

### 9.3 Schema Additions yang Diperlukan

```sql
-- ===== air_shipments_compileaircgk =====
ALTER TABLE air_shipments_compileaircgk
  ADD COLUMN awb              TEXT       GENERATED ALWAYS AS (extra_fields->>'awb') STORED,
  ADD COLUMN to_number        TEXT       GENERATED ALWAYS AS (extra_fields->>'to_number') STORED,
  ADD COLUMN gross_weight     NUMERIC    GENERATED ALWAYS AS ((extra_fields->>'gross_weight')::NUMERIC) STORED,
  ADD COLUMN amount_revenue   NUMERIC    GENERATED ALWAYS AS ((extra_fields->>'amount_revenue')::NUMERIC) STORED,
  ADD COLUMN packing_kayu     NUMERIC    GENERATED ALWAYS AS (
                                            COALESCE((extra_fields->>'additional_amount_packing_kayu')::NUMERIC, 0)) STORED,
  ADD COLUMN completed_time   TIMESTAMP  GENERATED ALWAYS AS ((extra_fields->>'completed_time')::TIMESTAMP) STORED,
  ADD COLUMN cycle_period     TEXT       GENERATED ALWAYS AS (
      TO_CHAR((extra_fields->>'completed_time')::TIMESTAMP, 'YYYY-MM') ||
      CASE WHEN EXTRACT(DAY FROM (extra_fields->>'completed_time')::TIMESTAMP) <= 15
           THEN '-1H' ELSE '-2H' END
  ) STORED;

CREATE INDEX idx_compile_awb            ON air_shipments_compileaircgk(awb);
CREATE INDEX idx_compile_to_number      ON air_shipments_compileaircgk(to_number);
CREATE INDEX idx_compile_cycle          ON air_shipments_compileaircgk(cycle_period);
CREATE INDEX idx_compile_cycle_awb      ON air_shipments_compileaircgk(cycle_period, awb);
CREATE INDEX idx_compile_completed_time ON air_shipments_compileaircgk(completed_time);

-- ===== air_shipments_smu_rate_cgk_spx =====
ALTER TABLE air_shipments_smu_rate_cgk_spx
  ADD COLUMN awb       TEXT GENERATED ALWAYS AS (extra_fields->>'awb') STORED,
  ADD COLUMN account   TEXT GENERATED ALWAYS AS (extra_fields->>'account') STORED,
  ADD COLUMN airlines  TEXT GENERATED ALWAYS AS (extra_fields->>'airlines') STORED,
  ADD COLUMN via       TEXT GENERATED ALWAYS AS (extra_fields->>'via') STORED,
  ADD COLUMN dest      TEXT GENERATED ALWAYS AS (extra_fields->>'dest') STORED,
  ADD COLUMN ra_name   TEXT GENERATED ALWAYS AS (extra_fields->>'ra') STORED;

CREATE UNIQUE INDEX idx_smurate_awb     ON air_shipments_smu_rate_cgk_spx(awb);
CREATE INDEX idx_smurate_lookup         ON air_shipments_smu_rate_cgk_spx(account, airlines, via, dest);

-- ===== air_shipments_smu (dim) =====
ALTER TABLE air_shipments_smu
  ADD COLUMN vendor      TEXT    GENERATED ALWAYS AS (extra_fields->>'vendor') STORED,
  ADD COLUMN airlines    TEXT    GENERATED ALWAYS AS (extra_fields->>'airlines') STORED,
  ADD COLUMN origin      TEXT    GENERATED ALWAYS AS (extra_fields->>'origin') STORED,
  ADD COLUMN destination TEXT    GENERATED ALWAYS AS (extra_fields->>'destination') STORED,
  ADD COLUMN total_cost_smu_per_kg NUMERIC GENERATED ALWAYS AS ((extra_fields->>'total_cost_smu_per_kg')::NUMERIC) STORED,
  ADD COLUMN admin_smu   NUMERIC GENERATED ALWAYS AS ((extra_fields->>'admin_smu')::NUMERIC) STORED,
  ADD COLUMN sg_out      TEXT    GENERATED ALWAYS AS (extra_fields->>'sg_out') STORED;

CREATE UNIQUE INDEX idx_smu_lookup ON air_shipments_smu(vendor, airlines, origin, destination);

-- ===== air_shipments_ra (dim) =====
ALTER TABLE air_shipments_ra
  ADD COLUMN ra_name_lower TEXT GENERATED ALWAYS AS (LOWER(extra_fields->>'ra_name')) STORED,
  ADD COLUMN rate          NUMERIC GENERATED ALWAYS AS ((extra_fields->>'rate')::NUMERIC) STORED,
  ADD COLUMN admin         NUMERIC GENERATED ALWAYS AS ((extra_fields->>'admin')::NUMERIC) STORED,
  ADD COLUMN ppn           NUMERIC GENERATED ALWAYS AS ((extra_fields->>'ppn')::NUMERIC) STORED;

CREATE UNIQUE INDEX idx_ra_name_lower ON air_shipments_ra(ra_name_lower);

-- ===== air_shipments_sg_outgoing (dim) =====
ALTER TABLE air_shipments_sg_outgoing
  ADD COLUMN sg_outgoing_name TEXT    GENERATED ALWAYS AS (extra_fields->>'sg_outgoing_name') STORED,
  ADD COLUMN rate             NUMERIC GENERATED ALWAYS AS ((extra_fields->>'rate')::NUMERIC) STORED,
  ADD COLUMN admin            NUMERIC GENERATED ALWAYS AS ((extra_fields->>'admin')::NUMERIC) STORED,
  ADD COLUMN ppn              NUMERIC GENERATED ALWAYS AS ((extra_fields->>'ppn')::NUMERIC) STORED;

CREATE UNIQUE INDEX idx_sg_outgoing_name ON air_shipments_sg_outgoing(sg_outgoing_name);
```

Setelah ini, view `v_pnl_to` di Section 8 bisa di-rewrite menggunakan kolom langsung (bukan `extra_fields->>'...'`) untuk perf yang lebih baik dan readability.

### 9.4 Edge Case: AWB yang Span Multiple Cycles

Karena `cycle_period` ditentukan oleh `completed_time` per-TO, dan TOs di satu AWB bisa complete di hari yang berbeda, ada kemungkinan AWB span 2 cycles (terutama AWB yang fly di tanggal 14-16 atau di akhir bulan). Estimasi affected: ~6-7% AWB (2 boundary days dari 30).

**Perlakuan yang benar:** Cost AWB harus tetap dihitung pakai **full AWB weight**, bukan slice di cycle yang di-filter. Allocation by weight share secara otomatis distribute cost ke TOs di cycle masing-masing.

**Implikasi SQL:** CTE `awb_totals` di view harus baca dari **full table**, jangan ikut filter cycle. Filter cycle di-apply di outer SELECT.

```sql
-- ✅ BENAR
WITH awb_totals AS (
    SELECT awb, SUM(gross_weight) AS sum_gw_per_awb
    FROM air_shipments_compileaircgk          -- unfiltered
    GROUP BY awb
)
SELECT ... FROM compile c
JOIN awb_totals at ON at.awb = c.awb
WHERE c.cycle_period = '2026-04-2H';          -- filter di outer

-- ❌ SALAH (allocation jadi salah untuk cross-cycle AWB)
WITH compile AS (
    SELECT * FROM air_shipments_compileaircgk
    WHERE cycle_period = '2026-04-2H'         -- filter di awal
),
awb_totals AS (
    SELECT awb, SUM(gross_weight) FROM compile GROUP BY awb
)
```

### 9.5 Estimasi Performance untuk 20-50 Concurrent Users

| Metric | Estimasi |
|---|---|
| Per dashboard load | 5-10 query, masing-masing <500ms |
| Total page load | 3-5 detik |
| Peak concurrent loads | 5-10 simultaneous |
| Connection pool size disarankan | 20-30 connection |
| Cache layer (Redis) | **Tidak perlu di MVP** |

### 9.6 Monitoring & Escalation Triggers

Tambahkan metric monitoring untuk trigger optimasi lanjutan:
- Query p95 latency `v_pnl_to` >2s → escalate ke materialized cost table
- Sync lag (delay antara sheet update vs DB) >2 menit → optimize sync layer
- Concurrent connection >80% pool size → tambah pool size atau cache layer

---

## 10. Dashboard UI

### 10.1 KPI Cards (default filter: cycle terbaru)
Total Revenue, Total Cost, Gross Profit, Gross Margin %, Total TOs, Total AWBs, Avg Margin per Kg.

### 10.2 Trend Chart
Line: Revenue vs Cost vs Profit per `cycle_period`.

### 10.3 Heatmap Margin per Route
Matrix Origin × Destination, color = margin %, size = volume.

### 10.4 Vendor / Airline Breakdown
Tabel sortable dengan kolom Vendor, Airline, Volume, Revenue, Cost SMU/RA/SG, GP, Margin %.

### 10.5 AWB Drilldown Table
Pilih cycle → list AWB. Per AWB tampilkan:
- Total Revenue (sum dari TO-nya)
- Cost SMU, Cost RA, Cost SG (di level AWB)
- Total Cost
- GP & Margin
- Weight: `compile_gw` vs `chwt_airlines` (dengan flag warning kalau gap >10%)
- Number of TOs

### 10.6 Data Quality Panel
Section terpisah untuk surface:
- AWB di compile yang gak ada di SMU RATE (orphan)
- AWB dengan cost = NULL (lookup gagal)
- AWB dengan weight gap signifikan (compile vs airline)

---

## 11. Roadmap

### Phase 1 — Data Foundation (1-2 minggu)
1. Sync `Database_Harga_CGK-SUB.xlsx` ke Postgres dengan format `air_shipments_smu`, `air_shipments_ra`, `air_shipments_sg_outgoing`, `air_shipments_sg_incoming`.
2. Apply schema additions di Section 9.3 (generated columns + indexes).
3. Build view `v_pnl_to` dari spec di Section 8 (rewrite menggunakan generated columns).
4. Validate ke 1-2 AWB closed: pastikan revenue match data compile, surface weight gap.
5. Resolve 8 open questions di Section 7.

### Phase 2 — Dashboard MVP (1-2 minggu)
KPI cards, trend chart, AWB drilldown, data quality panel.

### Phase 3 — Advanced (2-3 minggu)
Heatmap route, vendor breakdown, invoice reconciliation tool, SLA/penalty estimation.

### Phase 4 — Out of Scope MVP
Forecasting, what-if analysis, P&L darat (non-air).
