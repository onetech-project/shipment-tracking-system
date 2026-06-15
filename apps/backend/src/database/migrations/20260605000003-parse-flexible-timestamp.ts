import { MigrationInterface, QueryRunner } from 'typeorm'

// Tolerant timestamp parser for the free-text `date` field on the booking tables. That field
// holds mixed renderings depending on how the source cell was typed/formatted —
//   English   "7 May 2026"
//   ISO       "2026-05-23T00:00:00.000Z"
//   Indonesian "30 Mei 2026 23:30"   (sheet locale = id-ID)
// A bare `::timestamp` cast inside batchDeleteByDate / batchLockByDate aborts the ENTIRE
// statement on the first Indonesian row:
//   invalid input syntax for type timestamp: "30 Mei 2026 23:30"
//
// Strategy: normalise Indonesian month names (full + 3-letter) to English, then cast. Anything
// that still won't parse yields NULL — the row simply falls outside every range instead of
// crashing the query. Mirrors the EXCEPTION→NULL convention of pnl_parse_date / pnl_parse_numeric.
export class ParseFlexibleTimestamp20260605000003 implements MigrationInterface {
  name = 'ParseFlexibleTimestamp20260605000003'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE OR REPLACE FUNCTION parse_flexible_timestamp(txt TEXT) RETURNS TIMESTAMP AS $$
      DECLARE
        s TEXT := BTRIM(COALESCE(txt, ''));
      BEGIN
        IF s = '' THEN RETURN NULL; END IF;
        -- Indonesian month names → English (full names first, then 3-letter abbreviations).
        -- Whole-word (\\y), case-insensitive; the Indonesian-only tokens below never collide
        -- with English month spellings, so already-English values pass through untouched.
        s := regexp_replace(s, '\\yjanuari\\y',  'January',  'gi');
        s := regexp_replace(s, '\\yfebruari\\y', 'February', 'gi');
        s := regexp_replace(s, '\\ymaret\\y',    'March',    'gi');
        s := regexp_replace(s, '\\yagustus\\y',  'August',   'gi');
        s := regexp_replace(s, '\\yoktober\\y',  'October',  'gi');
        s := regexp_replace(s, '\\ydesember\\y', 'December', 'gi');
        s := regexp_replace(s, '\\yjuni\\y',     'June',     'gi');
        s := regexp_replace(s, '\\yjuli\\y',     'July',     'gi');
        s := regexp_replace(s, '\\ymei\\y',      'May',      'gi');
        s := regexp_replace(s, '\\yagu\\y',      'Aug',      'gi');
        s := regexp_replace(s, '\\yagt\\y',      'Aug',      'gi');
        s := regexp_replace(s, '\\yags\\y',      'Aug',      'gi');
        s := regexp_replace(s, '\\yokt\\y',      'Oct',      'gi');
        s := regexp_replace(s, '\\ydes\\y',      'Dec',      'gi');
        RETURN s::TIMESTAMP;
      EXCEPTION WHEN OTHERS THEN
        RETURN NULL;
      END;
      $$ LANGUAGE plpgsql IMMUTABLE;
    `)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP FUNCTION IF EXISTS parse_flexible_timestamp(TEXT)`)
  }
}
