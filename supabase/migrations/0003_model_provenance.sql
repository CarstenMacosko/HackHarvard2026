-- Models trained outside the browser (training kit, or Droid in GitHub Actions) record their
-- dataset, licence, label source and evaluation summary. Bundled models are served from the
-- web app's code; a row only appears here once someone changes one (e.g. deactivates it).
alter table cv_models add column provenance jsonb;
