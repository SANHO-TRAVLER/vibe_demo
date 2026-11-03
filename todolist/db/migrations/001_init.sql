-- 퀘스트 한 개 = 한 줄. 내용은 app.js 의 퀘스트 객체를 그대로 jsonb 로 담는다.
-- (필드가 늘어도 표를 고칠 필요 없이 앱의 storage.normalize() 가 기본값을 채운다.)
-- 지운 퀘스트는 바로 없애지 않고 deleted_at 만 찍어 둔다 (실수로 지워도 되살릴 수 있게).
CREATE TABLE IF NOT EXISTS quests (
  id text PRIMARY KEY,
  data jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);

CREATE INDEX IF NOT EXISTS quests_live_idx ON quests (updated_at) WHERE deleted_at IS NULL;
