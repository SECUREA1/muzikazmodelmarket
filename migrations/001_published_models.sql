CREATE TABLE IF NOT EXISTS published_models (
  id UUID PRIMARY KEY,
  title TEXT NOT NULL,
  creator_name TEXT NOT NULL,
  description TEXT,
  category TEXT,
  model_type TEXT NOT NULL,
  model_url TEXT NOT NULL,
  ios_model_url TEXT,
  thumbnail_url TEXT,
  status TEXT NOT NULL DEFAULT 'published',
  featured BOOLEAN NOT NULL DEFAULT FALSE,
  spawn_position JSONB,
  scale DOUBLE PRECISION DEFAULT 1,
  rotation JSONB,
  environment TEXT,
  published_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_published_models_status ON published_models(status);
CREATE INDEX IF NOT EXISTS idx_published_models_published_at ON published_models(published_at DESC);
CREATE INDEX IF NOT EXISTS idx_published_models_creator_name ON published_models(creator_name);
CREATE INDEX IF NOT EXISTS idx_published_models_category ON published_models(category);
