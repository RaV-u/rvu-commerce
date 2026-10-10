-- Upgrade existing persistent databases without replaying prior migrations.
ALTER TABLE store.runs DROP CONSTRAINT IF EXISTS runs_profile_check;
ALTER TABLE store.runs ADD CONSTRAINT runs_profile_check
 CHECK (profile IN ('secure-baseline','B01','B02','B03','B04','B05','B06','B07','B08','B09','B10','B11','B12','R01','R02','R03','R04','R05','R06','open-playground'));
