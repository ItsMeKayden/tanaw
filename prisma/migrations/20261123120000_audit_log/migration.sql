-- =====================================================================
-- Audit log (User Management > Audit Log).
--
-- Every INSERT / UPDATE / DELETE / TRUNCATE on every table is recorded by
-- database triggers, so nothing escapes it: app actions, cascaded deletes,
-- scripts, seeds and manual SQL. The app tells the triggers who is acting
-- through transaction-local settings (see lib/prisma.ts):
--   tanaw.actor_id, tanaw.actor_name, tanaw.actor_email, tanaw.actor_role,
--   tanaw.user_agent
-- Changes made without them (scripts, psql) are logged as "System".
--
-- Entries are readable on their own:
--   * record_label names the record ("APP-0012 — Juan Dela Cruz") and
--     refs names every linked record, before and after the change
--     ({"role_id:4": "Registrar"}), both
--     resolved when the change happens, so they survive later deletions.
--   * One entry per record per transaction, holding the net change: a
--     delete + re-insert of the same row becomes one UPDATE (or nothing if
--     the data is the same); create + edit becomes one INSERT.
--   * Updates that only touch bookkeeping timestamps are not logged.
--
-- Tables created by later migrations must be attached with:
--   SELECT tanaw_audit_attach('"tbl_new_table"');
-- (or SELECT tanaw_audit_attach_all(); which is safe to re-run).
-- Additive only.
-- =====================================================================

-- CreateTable
CREATE TABLE "tbl_audit_log" (
    "audit_id" BIGSERIAL NOT NULL,
    "occurred_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "action" VARCHAR(30) NOT NULL,
    "table_name" VARCHAR(100),
    "record_id" VARCHAR(200),
    "record_label" TEXT,
    "refs" JSONB,
    "actor_id" INTEGER,
    "actor_name" VARCHAR(150),
    "actor_email" VARCHAR(150),
    "actor_role" VARCHAR(100),
    "user_agent" TEXT,
    "transaction_id" BIGINT,
    "old_data" JSONB,
    "new_data" JSONB,
    "changed_fields" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "description" TEXT,

    CONSTRAINT "tbl_audit_log_pkey" PRIMARY KEY ("audit_id")
);

-- CreateIndex
CREATE INDEX "tbl_audit_log_occurred_at_idx" ON "tbl_audit_log"("occurred_at");

-- CreateIndex
CREATE INDEX "tbl_audit_log_table_name_record_id_idx" ON "tbl_audit_log"("table_name", "record_id");

-- CreateIndex
CREATE INDEX "tbl_audit_log_actor_id_idx" ON "tbl_audit_log"("actor_id");

-- CreateIndex
CREATE INDEX "tbl_audit_log_action_idx" ON "tbl_audit_log"("action");

-- CreateIndex
CREATE INDEX "tbl_audit_log_transaction_id_idx" ON "tbl_audit_log"("transaction_id");

-- ---------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------

-- Secrets and large blobs are never copied into the log. They are replaced
-- by a short fingerprint so a change to them is still detected and listed.
CREATE OR REPLACE FUNCTION tanaw_audit_mask(p_data jsonb) RETURNS jsonb
LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE
    v_col text;
BEGIN
    IF p_data IS NULL THEN
        RETURN NULL;
    END IF;
    FOREACH v_col IN ARRAY ARRAY['password_hash', 'password', 'token_hash'] LOOP
        IF p_data ? v_col AND p_data -> v_col <> 'null'::jsonb THEN
            p_data := p_data || jsonb_build_object(v_col, '[hidden ' || left(md5(p_data ->> v_col), 8) || ']');
        END IF;
    END LOOP;
    FOREACH v_col IN ARRAY ARRAY['file_data', 'boundary_geojson'] LOOP
        IF p_data ? v_col AND p_data -> v_col <> 'null'::jsonb THEN
            p_data := p_data || jsonb_build_object(v_col, '[omitted ' || left(md5(p_data ->> v_col), 8) || ']');
        END IF;
    END LOOP;
    RETURN p_data;
END;
$$;

-- Fields that differ between two row snapshots, ignoring bookkeeping
-- timestamps that change on every save.
CREATE OR REPLACE FUNCTION tanaw_audit_diff(p_old jsonb, p_new jsonb) RETURNS text[]
LANGUAGE sql IMMUTABLE AS $$
    SELECT coalesce(array_agg(k.key ORDER BY k.key), ARRAY[]::text[])
      FROM (SELECT jsonb_object_keys(coalesce(p_old, '{}'::jsonb) || coalesce(p_new, '{}'::jsonb)) AS key) k
     WHERE k.key NOT IN ('generated_at', 'updated_at')
       AND (p_old -> k.key) IS DISTINCT FROM (p_new -> k.key);
$$;

-- "SYSTEM_ADMIN" → "System Admin"
CREATE OR REPLACE FUNCTION tanaw_audit_title(p_code text) RETURNS text
LANGUAGE sql IMMUTABLE AS $$
    SELECT initcap(replace(lower(p_code), '_', ' '));
$$;

-- Human name of a row, given its table and data.
CREATE OR REPLACE FUNCTION tanaw_audit_label(p_table text, r jsonb) RETURNS text
LANGUAGE plpgsql STABLE AS $$
BEGIN
    IF r IS NULL THEN
        RETURN NULL;
    END IF;

    RETURN nullif(CASE p_table
        WHEN 'tbl_applicant' THEN
            concat_ws(' ', r ->> 'first_name', r ->> 'middle_name', r ->> 'last_name', r ->> 'suffix')
        WHEN 'tbl_application' THEN
            concat_ws(' — ', r ->> 'application_no', tanaw_audit_ref('tbl_applicant', r ->> 'applicant_id'))
        WHEN 'tbl_application_stage_log' THEN
            concat_ws(' → ', tanaw_audit_ref('tbl_application', r ->> 'application_id'),
                             tanaw_audit_ref('tbl_admission_stage', r ->> 'stage_id'))
        WHEN 'tbl_application_document' THEN
            concat_ws(' · ', regexp_replace(tanaw_audit_title(r ->> 'document_type'), '\mPsa\M', 'PSA'),
                             tanaw_audit_ref('tbl_application', r ->> 'application_id'))
        WHEN 'tbl_admission_cycle' THEN 'S.Y. ' || (r ->> 'school_year')
        WHEN 'tbl_admission_stage' THEN r ->> 'stage_name'
        WHEN 'tbl_barangay' THEN r ->> 'barangay_name'
        WHEN 'tbl_district' THEN r ->> 'district_name'
        WHEN 'tbl_branch' THEN r ->> 'branch_name'
        WHEN 'tbl_school' THEN r ->> 'school_name'
        WHEN 'tbl_competency' THEN r ->> 'competency_name'
        WHEN 'tbl_program' THEN concat_ws(' – ', r ->> 'program_code', r ->> 'program_name')
        WHEN 'tbl_program_competency' THEN
            concat_ws(' · ', tanaw_audit_ref('tbl_program', r ->> 'program_id'),
                             tanaw_audit_ref('tbl_competency', r ->> 'competency_id'))
        WHEN 'tbl_course_recommendation' THEN
            concat_ws(' · ', tanaw_audit_ref('tbl_application', r ->> 'application_id'),
                             tanaw_audit_ref('tbl_program', r ->> 'program_id'))
        WHEN 'tbl_exam' THEN r ->> 'exam_name'
        WHEN 'tbl_exam_question' THEN
            concat_ws(' · ', tanaw_audit_ref('tbl_exam', r ->> 'exam_id'), 'Question ' || (r ->> 'question_no'))
        WHEN 'tbl_exam_result' THEN
            concat_ws(' · ', tanaw_audit_ref('tbl_application', r ->> 'application_id'),
                             tanaw_audit_ref('tbl_exam', r ->> 'exam_id'))
        WHEN 'tbl_exam_subject_score' THEN
            concat_ws(' · ', tanaw_audit_ref('tbl_exam_result', r ->> 'result_id'),
                             tanaw_audit_ref('tbl_competency', r ->> 'competency_id'))
        WHEN 'tbl_question_response' THEN
            concat_ws(' · ', tanaw_audit_ref('tbl_exam_result', r ->> 'result_id'),
                             'Question ' || coalesce((SELECT q.question_no::text FROM tbl_exam_question q
                                                       WHERE q.question_id = (r ->> 'question_id')::int),
                                                     r ->> 'question_id'))
        WHEN 'tbl_exam_session' THEN
            concat_ws(' · ', to_char((r ->> 'session_date')::date, 'Mon DD, YYYY'), r ->> 'start_time',
                             r ->> 'venue', 'Room ' || (r ->> 'room'))
        WHEN 'tbl_exam_session_applicant' THEN
            concat_ws(' · ', tanaw_audit_ref('tbl_application', r ->> 'application_id'),
                             tanaw_audit_ref('tbl_exam_session', r ->> 'session_id'))
        WHEN 'tbl_import_batch' THEN r ->> 'file_name'
        WHEN 'tbl_passing_score_setting' THEN
            concat_ws(' · ', tanaw_audit_ref('tbl_admission_cycle', r ->> 'cycle_id'),
                             tanaw_audit_title(r ->> 'criteria_type'))
        WHEN 'tbl_quota' THEN
            concat_ws(' · ', coalesce(tanaw_audit_ref('tbl_program', r ->> 'program_id'), 'Overall'),
                             tanaw_audit_ref('tbl_branch', r ->> 'branch_id'),
                             tanaw_audit_ref('tbl_admission_cycle', r ->> 'cycle_id'))
        WHEN 'tbl_recommendation_setting' THEN 'Course recommendation settings'
        WHEN 'tbl_user_account' THEN
            (r ->> 'full_name') || coalesce(' (' || (r ->> 'email') || ')', '')
        WHEN 'tbl_role' THEN coalesce(nullif(r ->> 'display_name', ''), tanaw_audit_title(r ->> 'role_name'))
        WHEN 'tbl_permission' THEN
            tanaw_audit_title(r ->> 'module_name') || ' (' ||
            lower(regexp_replace(r ->> 'permission_code', '^.*_', '')) || ')'
        WHEN 'tbl_role_permission' THEN
            concat_ws(' · ', tanaw_audit_ref('tbl_role', r ->> 'role_id'),
                             tanaw_audit_ref('tbl_permission', r ->> 'permission_id'))
        WHEN 'tbl_password_reset_token' THEN
            'Reset link for ' || tanaw_audit_ref('tbl_user_account', r ->> 'user_id')
        WHEN 'User' THEN r ->> 'name'
        ELSE NULL
    END, '');
END;
$$;

-- Human name of a row given its table and primary key. Reads the live row,
-- or — when it was already deleted (e.g. by a cascade) — the last name the
-- audit log recorded for it.
CREATE OR REPLACE FUNCTION tanaw_audit_ref(p_table text, p_id text) RETURNS text
LANGUAGE plpgsql STABLE AS $$
DECLARE
    v_rel regclass := to_regclass(quote_ident(p_table));
    v_pk text;
    v_type text;
    v_row jsonb;
    v_label text;
BEGIN
    IF p_id IS NULL OR v_rel IS NULL THEN
        RETURN NULL;
    END IF;

    SELECT a.attname, format_type(a.atttypid, a.atttypmod)
      INTO v_pk, v_type
      FROM pg_index i
      JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = ANY (i.indkey)
     WHERE i.indrelid = v_rel AND i.indisprimary AND i.indnatts = 1;

    IF v_pk IS NOT NULL THEN
        BEGIN
            EXECUTE format('SELECT to_jsonb(t) FROM %s t WHERE %I = CAST($1 AS %s)', v_rel, v_pk, v_type)
               INTO v_row USING p_id;
        EXCEPTION WHEN invalid_text_representation THEN
            v_row := NULL;
        END;
        v_label := tanaw_audit_label(p_table, v_row);
    END IF;

    IF v_label IS NULL THEN
        SELECT l.record_label INTO v_label
          FROM tbl_audit_log l
         WHERE l.table_name = p_table AND l.record_id = p_id AND l.record_label IS NOT NULL
         ORDER BY l.audit_id DESC
         LIMIT 1;
    END IF;

    RETURN v_label;
END;
$$;

-- Names of the records a row links to, before and after the change, keyed
-- "column:value": {"role_id:4": "Registrar", "archived_by:1": "System Admin"}
CREATE OR REPLACE FUNCTION tanaw_audit_refs(p_rel regclass, p_old jsonb, p_new jsonb) RETURNS jsonb
LANGUAGE plpgsql STABLE AS $$
DECLARE
    v_fk record;
    v_value text;
    v_label text;
    v_refs jsonb := '{}'::jsonb;
BEGIN
    FOR v_fk IN
        SELECT a.attname AS col, cf.relname AS ref_table
          FROM pg_constraint c
          JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = c.conkey[1]
          JOIN pg_class cf ON cf.oid = c.confrelid
         WHERE c.conrelid = p_rel AND c.contype = 'f' AND cardinality(c.conkey) = 1
    LOOP
        FOREACH v_value IN ARRAY ARRAY[p_old ->> v_fk.col, p_new ->> v_fk.col] LOOP
            IF v_value IS NOT NULL AND NOT v_refs ? (v_fk.col || ':' || v_value) THEN
                v_label := tanaw_audit_ref(v_fk.ref_table, v_value);
                IF v_label IS NOT NULL THEN
                    v_refs := v_refs || jsonb_build_object(v_fk.col || ':' || v_value, v_label);
                END IF;
            END IF;
        END LOOP;
    END LOOP;
    RETURN nullif(v_refs, '{}'::jsonb);
END;
$$;

-- ---------------------------------------------------------------------
-- Trigger functions
-- ---------------------------------------------------------------------

-- Row-level trigger. TG_ARGV holds the table's primary key column names.
CREATE OR REPLACE FUNCTION tanaw_audit_row() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
    v_old jsonb;
    v_new jsonb;
    v_record_id text;
    v_tx bigint := txid_current();
    v_prev tbl_audit_log%ROWTYPE;
    v_action text := TG_OP;
    v_changed text[] := ARRAY[]::text[];
    v_actor_id text := nullif(current_setting('tanaw.actor_id', true), '');
BEGIN
    IF TG_OP IN ('UPDATE', 'DELETE') THEN
        v_old := tanaw_audit_mask(to_jsonb(OLD));
    END IF;
    IF TG_OP IN ('INSERT', 'UPDATE') THEN
        v_new := tanaw_audit_mask(to_jsonb(NEW));
    END IF;

    IF TG_NARGS > 0 THEN
        SELECT string_agg(coalesce(coalesce(v_new, v_old) ->> k.col, ''), ':' ORDER BY k.ord)
          INTO v_record_id
          FROM unnest(TG_ARGV) WITH ORDINALITY AS k(col, ord);
    END IF;

    -- Merge with this record's earlier entry in the same transaction, so the
    -- log holds one net change per record per save.
    IF v_record_id IS NOT NULL THEN
        SELECT * INTO v_prev
          FROM tbl_audit_log
         WHERE transaction_id = v_tx AND table_name = TG_TABLE_NAME AND record_id = v_record_id
         ORDER BY audit_id DESC
         LIMIT 1;

        IF FOUND THEN
            IF v_prev.action = 'INSERT' AND TG_OP = 'DELETE' THEN
                -- Created and removed again: nothing happened.
                DELETE FROM tbl_audit_log WHERE audit_id = v_prev.audit_id;
                RETURN NULL;
            ELSIF v_prev.action = 'INSERT' THEN
                -- Created, then edited: still a creation, with the final data.
                v_action := 'INSERT';
                v_old := NULL;
            ELSIF v_prev.action IN ('UPDATE', 'DELETE') THEN
                -- Keep the state from before the transaction.
                v_old := v_prev.old_data;
                v_action := CASE WHEN TG_OP = 'DELETE' THEN 'DELETE' ELSE 'UPDATE' END;
            END IF;

            IF v_action = 'UPDATE' THEN
                v_changed := tanaw_audit_diff(v_old, v_new);
            END IF;

            IF v_action = 'UPDATE' AND cardinality(v_changed) = 0 THEN
                -- Back to how it was (e.g. deleted and re-inserted unchanged).
                DELETE FROM tbl_audit_log WHERE audit_id = v_prev.audit_id;
            ELSE
                UPDATE tbl_audit_log
                   SET action = v_action,
                       old_data = v_old,
                       new_data = v_new,
                       changed_fields = v_changed,
                       record_label = coalesce(tanaw_audit_label(TG_TABLE_NAME, coalesce(v_new, v_old)), record_label),
                       refs = nullif(coalesce(refs, '{}'::jsonb)
                                     || coalesce(tanaw_audit_refs(TG_RELID, v_old, v_new), '{}'::jsonb), '{}'::jsonb)
                 WHERE audit_id = v_prev.audit_id;
            END IF;
            RETURN NULL;
        END IF;
    END IF;

    IF TG_OP = 'UPDATE' THEN
        v_changed := tanaw_audit_diff(v_old, v_new);
        -- An UPDATE that changed nothing (or only timestamps) is not a change.
        IF cardinality(v_changed) = 0 THEN
            RETURN NULL;
        END IF;
    END IF;

    INSERT INTO "tbl_audit_log" (
        "action", "table_name", "record_id", "record_label", "refs",
        "actor_id", "actor_name", "actor_email", "actor_role", "user_agent",
        "transaction_id", "old_data", "new_data", "changed_fields"
    ) VALUES (
        TG_OP, TG_TABLE_NAME, v_record_id,
        tanaw_audit_label(TG_TABLE_NAME, coalesce(v_new, v_old)),
        tanaw_audit_refs(TG_RELID, v_old, v_new),
        CASE WHEN v_actor_id ~ '^[0-9]+$' THEN v_actor_id::integer END,
        nullif(current_setting('tanaw.actor_name', true), ''),
        nullif(current_setting('tanaw.actor_email', true), ''),
        nullif(current_setting('tanaw.actor_role', true), ''),
        nullif(current_setting('tanaw.user_agent', true), ''),
        v_tx, v_old, v_new, v_changed
    );

    RETURN NULL;
END;
$$;

-- Statement-level trigger for TRUNCATE (no rows are available).
CREATE OR REPLACE FUNCTION tanaw_audit_truncate() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
    v_actor_id text := nullif(current_setting('tanaw.actor_id', true), '');
BEGIN
    INSERT INTO "tbl_audit_log" (
        "action", "table_name",
        "actor_id", "actor_name", "actor_email", "actor_role", "user_agent",
        "transaction_id", "description"
    ) VALUES (
        'TRUNCATE', TG_TABLE_NAME,
        CASE WHEN v_actor_id ~ '^[0-9]+$' THEN v_actor_id::integer END,
        nullif(current_setting('tanaw.actor_name', true), ''),
        nullif(current_setting('tanaw.actor_email', true), ''),
        nullif(current_setting('tanaw.actor_role', true), ''),
        nullif(current_setting('tanaw.user_agent', true), ''),
        txid_current(),
        'All rows were removed from the table.'
    );
    RETURN NULL;
END;
$$;

-- Attaches the audit triggers to one table (re-runnable).
CREATE OR REPLACE FUNCTION tanaw_audit_attach(p_table regclass) RETURNS void
LANGUAGE plpgsql AS $$
DECLARE
    v_args text;
BEGIN
    SELECT string_agg(quote_literal(a.attname), ', ' ORDER BY array_position(i.indkey::int2[], a.attnum))
      INTO v_args
      FROM pg_index i
      JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = ANY (i.indkey)
     WHERE i.indrelid = p_table AND i.indisprimary;

    -- Named to sort before Postgres's "RI_..." foreign-key triggers: AFTER
    -- triggers fire alphabetically, so a parent row is logged before the
    -- rows its cascade deletes, and they can name it.
    EXECUTE format('DROP TRIGGER IF EXISTS "A_tanaw_audit_row" ON %s', p_table);
    EXECUTE format(
        'CREATE TRIGGER "A_tanaw_audit_row" AFTER INSERT OR UPDATE OR DELETE ON %s '
        'FOR EACH ROW EXECUTE FUNCTION tanaw_audit_row(%s)',
        p_table, coalesce(v_args, '')
    );

    EXECUTE format('DROP TRIGGER IF EXISTS tanaw_audit_truncate ON %s', p_table);
    EXECUTE format(
        'CREATE TRIGGER tanaw_audit_truncate AFTER TRUNCATE ON %s '
        'FOR EACH STATEMENT EXECUTE FUNCTION tanaw_audit_truncate()',
        p_table
    );
END;
$$;

-- Attaches the audit triggers to every table in the current schema except
-- the audit log itself and Prisma's migration table (re-runnable).
CREATE OR REPLACE FUNCTION tanaw_audit_attach_all() RETURNS integer
LANGUAGE plpgsql AS $$
DECLARE
    v_table record;
    v_count integer := 0;
BEGIN
    FOR v_table IN
        SELECT c.oid::regclass AS rel
          FROM pg_class c
          JOIN pg_namespace n ON n.oid = c.relnamespace
         WHERE c.relkind IN ('r', 'p')
           AND n.nspname = current_schema()
           AND c.relname NOT IN ('tbl_audit_log', '_prisma_migrations')
    LOOP
        PERFORM tanaw_audit_attach(v_table.rel);
        v_count := v_count + 1;
    END LOOP;
    RETURN v_count;
END;
$$;

-- Audit entries are tamper-proof: once their transaction has committed they
-- can be neither edited nor deleted. (The trigger itself merges entries of
-- the transaction that is still running.) A retention clean-up can delete
-- old entries after: SELECT set_config('tanaw.audit_maintenance', 'on', true);
CREATE OR REPLACE FUNCTION tanaw_audit_log_guard() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
    IF OLD.transaction_id IS NOT DISTINCT FROM txid_current() THEN
        RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
    END IF;
    IF TG_OP = 'DELETE' AND current_setting('tanaw.audit_maintenance', true) = 'on' THEN
        RETURN OLD;
    END IF;
    RAISE EXCEPTION 'Audit log entries cannot be modified or deleted.';
END;
$$;

CREATE TRIGGER tanaw_audit_log_guard
BEFORE UPDATE OR DELETE ON "tbl_audit_log"
FOR EACH ROW EXECUTE FUNCTION tanaw_audit_log_guard();

SELECT tanaw_audit_attach_all();

-- ---------------------------------------------------------------------
-- AUDIT module permissions. System Admin gets read + write, President gets
-- read; other roles can be granted access on Roles & Permissions.
-- ---------------------------------------------------------------------
INSERT INTO "tbl_permission" ("permission_code", "module_name", "description")
VALUES
    ('AUDIT_READ', 'AUDIT', 'READ access for the AUDIT module.'),
    ('AUDIT_WRITE', 'AUDIT', 'WRITE access for the AUDIT module.')
ON CONFLICT ("permission_code") DO NOTHING;

INSERT INTO "tbl_role_permission" ("role_id", "permission_id")
SELECT r."role_id", p."permission_id"
  FROM "tbl_role" r
  JOIN "tbl_permission" p
    ON (r."role_name" = 'SYSTEM_ADMIN' AND p."permission_code" IN ('AUDIT_READ', 'AUDIT_WRITE'))
    OR (r."role_name" = 'PRESIDENT' AND p."permission_code" = 'AUDIT_READ')
ON CONFLICT DO NOTHING;
