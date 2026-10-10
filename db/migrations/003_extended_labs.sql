-- Version 3: isolated training entities for the additional 13 scenario families.
ALTER TABLE store.runs DROP CONSTRAINT runs_profile_check;
ALTER TABLE store.runs ADD CONSTRAINT runs_profile_check
 CHECK (profile IN ('secure-baseline','B01','B02','B03','B04','B05','B06','B07','B08','B09','B10','B11','B12','R01','R02','R03','R04','R05','R06','open-playground'));
CREATE TABLE store.lab_states(
 run_id uuid NOT NULL REFERENCES store.runs,
 user_id uuid NOT NULL,
 scenario text NOT NULL,
 data jsonb NOT NULL DEFAULT '{}'::jsonb,
 PRIMARY KEY(run_id,user_id,scenario),
 FOREIGN KEY(run_id,user_id) REFERENCES store.users(run_id,id)
);
CREATE TABLE store.lab_evidence(
 id uuid PRIMARY KEY,
 run_id uuid NOT NULL REFERENCES store.runs,
 user_id uuid NOT NULL,
 scenario text NOT NULL,
 kind text NOT NULL,
 detail jsonb NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(run_id,user_id) REFERENCES store.users(run_id,id)
);
CREATE INDEX lab_evidence_run ON store.lab_evidence(run_id,scenario,kind);
CREATE TABLE store.lab_sales(
 id uuid PRIMARY KEY,
 run_id uuid NOT NULL REFERENCES store.runs,
 user_id uuid NOT NULL,
 scenario text NOT NULL,
 delivered_total bigint NOT NULL CHECK(delivered_total>0),
 charged_total bigint NOT NULL CHECK(charged_total>0),
 journal_id uuid NOT NULL,
 items jsonb NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(run_id,user_id) REFERENCES store.users(run_id,id),
 FOREIGN KEY(run_id,journal_id) REFERENCES store.journals(run_id,id)
);
CREATE TABLE store.lab_attempts(
 id uuid PRIMARY KEY,
 run_id uuid NOT NULL REFERENCES store.runs,
 username text NOT NULL,
 accepted boolean NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX lab_attempts_counter ON store.lab_attempts(run_id,username);
CREATE TABLE store.lab_resets(
 id uuid PRIMARY KEY,
 run_id uuid NOT NULL REFERENCES store.runs,
 user_id uuid NOT NULL,
 token_hash text NOT NULL,
 used_at timestamptz,
 expires_at timestamptz NOT NULL,
 FOREIGN KEY(run_id,user_id) REFERENCES store.users(run_id,id)
);
CREATE INDEX lab_reset_lookup ON store.lab_resets(run_id,user_id,token_hash);
CREATE TABLE store.lab_registrations(
 id uuid PRIMARY KEY,
 run_id uuid NOT NULL REFERENCES store.runs,
 user_id uuid NOT NULL,
 email text NOT NULL,
 token text,
 verified boolean NOT NULL DEFAULT false,
 completed boolean NOT NULL DEFAULT false,
 created_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(run_id,user_id) REFERENCES store.users(run_id,id)
);
