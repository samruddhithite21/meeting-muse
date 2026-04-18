-- Roles enum + table
CREATE TYPE public.app_role AS ENUM ('admin', 'member', 'leadership');

CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role app_role NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role app_role)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = _role
  )
$$;

CREATE POLICY "Users read own roles" ON public.user_roles FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Admins manage roles" ON public.user_roles FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Updated_at helper
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

-- Profiles
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name TEXT,
  avatar_url TEXT,
  language TEXT NOT NULL DEFAULT 'en',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Profiles viewable by all signed-in users" ON public.profiles FOR SELECT TO authenticated USING (true);
CREATE POLICY "Users insert own profile" ON public.profiles FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users update own profile" ON public.profiles FOR UPDATE TO authenticated USING (auth.uid() = user_id);
CREATE TRIGGER trg_profiles_updated BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Settings: per-user local AI endpoints + encryption key fingerprint
CREATE TABLE public.user_settings (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  ollama_url TEXT NOT NULL DEFAULT 'http://localhost:11434',
  ollama_model TEXT NOT NULL DEFAULT 'llama3.1',
  whisper_url TEXT NOT NULL DEFAULT 'http://localhost:8000',
  whisper_model TEXT NOT NULL DEFAULT 'base',
  encryption_key_fingerprint TEXT,
  leadership_mode BOOLEAN NOT NULL DEFAULT false,
  email_digest BOOLEAN NOT NULL DEFAULT true,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.user_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own settings" ON public.user_settings FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE TRIGGER trg_settings_updated BEFORE UPDATE ON public.user_settings FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Vocabulary
CREATE TABLE public.vocabulary (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  term TEXT NOT NULL,
  category TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.vocabulary ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_vocab_user ON public.vocabulary(user_id);
CREATE POLICY "Users manage own vocabulary" ON public.vocabulary FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- Meetings
CREATE TYPE public.meeting_status AS ENUM ('scheduled', 'live', 'processing', 'completed', 'failed');
CREATE TABLE public.meetings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  language TEXT NOT NULL DEFAULT 'en',
  status meeting_status NOT NULL DEFAULT 'scheduled',
  is_leadership BOOLEAN NOT NULL DEFAULT false,
  started_at TIMESTAMPTZ,
  ended_at TIMESTAMPTZ,
  duration_seconds INT,
  audio_path TEXT,
  audio_hash TEXT,
  encryption_iv TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.meetings ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_meetings_user ON public.meetings(user_id, started_at DESC);
CREATE POLICY "Users see own meetings" ON public.meetings FOR SELECT TO authenticated USING (
  auth.uid() = user_id AND (NOT is_leadership OR public.has_role(auth.uid(), 'leadership') OR public.has_role(auth.uid(), 'admin'))
);
CREATE POLICY "Users insert own meetings" ON public.meetings FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users update own meetings" ON public.meetings FOR UPDATE TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users delete own meetings" ON public.meetings FOR DELETE TO authenticated USING (auth.uid() = user_id);
CREATE TRIGGER trg_meetings_updated BEFORE UPDATE ON public.meetings FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Generic helper to check meeting ownership
CREATE OR REPLACE FUNCTION public.owns_meeting(_meeting_id UUID)
RETURNS BOOLEAN LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.meetings WHERE id = _meeting_id AND user_id = auth.uid())
$$;

-- Participants
CREATE TABLE public.meeting_participants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  meeting_id UUID NOT NULL REFERENCES public.meetings(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  name TEXT,
  role TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.meeting_participants ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_part_meeting ON public.meeting_participants(meeting_id);
CREATE POLICY "Owner manages participants" ON public.meeting_participants FOR ALL TO authenticated USING (public.owns_meeting(meeting_id)) WITH CHECK (public.owns_meeting(meeting_id));

-- Transcript segments
CREATE TABLE public.transcript_segments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  meeting_id UUID NOT NULL REFERENCES public.meetings(id) ON DELETE CASCADE,
  start_ms INT NOT NULL,
  end_ms INT NOT NULL,
  speaker TEXT,
  text_encrypted TEXT NOT NULL,
  text_iv TEXT NOT NULL,
  text_hash TEXT NOT NULL,
  confidence REAL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.transcript_segments ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_seg_meeting_time ON public.transcript_segments(meeting_id, start_ms);
CREATE POLICY "Owner reads segments" ON public.transcript_segments FOR SELECT TO authenticated USING (public.owns_meeting(meeting_id));
CREATE POLICY "Owner inserts segments" ON public.transcript_segments FOR INSERT TO authenticated WITH CHECK (public.owns_meeting(meeting_id));
CREATE POLICY "Owner deletes segments" ON public.transcript_segments FOR DELETE TO authenticated USING (public.owns_meeting(meeting_id));

-- Summaries (rolling + final)
CREATE TABLE public.summaries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  meeting_id UUID NOT NULL REFERENCES public.meetings(id) ON DELETE CASCADE,
  kind TEXT NOT NULL DEFAULT 'rolling',
  content_encrypted TEXT NOT NULL,
  content_iv TEXT NOT NULL,
  generated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.summaries ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_sum_meeting ON public.summaries(meeting_id, generated_at DESC);
CREATE POLICY "Owner manages summaries" ON public.summaries FOR ALL TO authenticated USING (public.owns_meeting(meeting_id)) WITH CHECK (public.owns_meeting(meeting_id));

-- Tasks
CREATE TYPE public.task_status AS ENUM ('pending','in_progress','completed','overdue');
CREATE TABLE public.tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  meeting_id UUID NOT NULL REFERENCES public.meetings(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  assignee_email TEXT,
  assignee_name TEXT,
  status task_status NOT NULL DEFAULT 'pending',
  due_date TIMESTAMPTZ,
  source_timestamp_ms INT,
  confidence REAL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.tasks ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_tasks_user ON public.tasks(user_id, status);
CREATE INDEX idx_tasks_meeting ON public.tasks(meeting_id);
CREATE POLICY "Owner manages tasks" ON public.tasks FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE TRIGGER trg_tasks_updated BEFORE UPDATE ON public.tasks FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Decisions
CREATE TABLE public.decisions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  meeting_id UUID NOT NULL REFERENCES public.meetings(id) ON DELETE CASCADE,
  text TEXT NOT NULL,
  source_timestamp_ms INT,
  confidence REAL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.decisions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Owner manages decisions" ON public.decisions FOR ALL TO authenticated USING (public.owns_meeting(meeting_id)) WITH CHECK (public.owns_meeting(meeting_id));

-- Open questions
CREATE TABLE public.open_questions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  meeting_id UUID NOT NULL REFERENCES public.meetings(id) ON DELETE CASCADE,
  text TEXT NOT NULL,
  source_timestamp_ms INT,
  resolved BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.open_questions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Owner manages questions" ON public.open_questions FOR ALL TO authenticated USING (public.owns_meeting(meeting_id)) WITH CHECK (public.owns_meeting(meeting_id));

-- Screenshots
CREATE TABLE public.screenshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  meeting_id UUID NOT NULL REFERENCES public.meetings(id) ON DELETE CASCADE,
  storage_path TEXT NOT NULL,
  timestamp_ms INT NOT NULL,
  caption TEXT,
  hash TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.screenshots ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_shots_meeting ON public.screenshots(meeting_id, timestamp_ms);
CREATE POLICY "Owner manages screenshots" ON public.screenshots FOR ALL TO authenticated USING (public.owns_meeting(meeting_id)) WITH CHECK (public.owns_meeting(meeting_id));

-- Unresolved cross-meeting topics
CREATE TABLE public.unresolved_topics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  topic TEXT NOT NULL,
  mention_count INT NOT NULL DEFAULT 1,
  status TEXT NOT NULL DEFAULT 'unresolved',
  last_meeting_id UUID REFERENCES public.meetings(id) ON DELETE SET NULL,
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.unresolved_topics ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_topics_user ON public.unresolved_topics(user_id, status);
CREATE POLICY "Owner manages topics" ON public.unresolved_topics FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- Email log
CREATE TABLE public.email_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  meeting_id UUID REFERENCES public.meetings(id) ON DELETE SET NULL,
  recipient_email TEXT NOT NULL,
  subject TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'queued',
  error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.email_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Owner reads email log" ON public.email_log FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Owner inserts email log" ON public.email_log FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

-- Auto-create profile + assign 'member' on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (user_id, display_name)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'display_name', split_part(NEW.email,'@',1)));
  INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'member');
  INSERT INTO public.user_settings (user_id) VALUES (NEW.id);
  RETURN NEW;
END;
$$;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Storage buckets
INSERT INTO storage.buckets (id, name, public) VALUES ('meeting-audio', 'meeting-audio', false) ON CONFLICT DO NOTHING;
INSERT INTO storage.buckets (id, name, public) VALUES ('meeting-screenshots', 'meeting-screenshots', false) ON CONFLICT DO NOTHING;
INSERT INTO storage.buckets (id, name, public) VALUES ('avatars', 'avatars', true) ON CONFLICT DO NOTHING;

CREATE POLICY "Users read own audio" ON storage.objects FOR SELECT TO authenticated USING (bucket_id='meeting-audio' AND auth.uid()::text = (storage.foldername(name))[1]);
CREATE POLICY "Users upload own audio" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id='meeting-audio' AND auth.uid()::text = (storage.foldername(name))[1]);
CREATE POLICY "Users delete own audio" ON storage.objects FOR DELETE TO authenticated USING (bucket_id='meeting-audio' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Users read own shots" ON storage.objects FOR SELECT TO authenticated USING (bucket_id='meeting-screenshots' AND auth.uid()::text = (storage.foldername(name))[1]);
CREATE POLICY "Users upload own shots" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id='meeting-screenshots' AND auth.uid()::text = (storage.foldername(name))[1]);
CREATE POLICY "Users delete own shots" ON storage.objects FOR DELETE TO authenticated USING (bucket_id='meeting-screenshots' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Avatars publicly readable" ON storage.objects FOR SELECT USING (bucket_id='avatars');
CREATE POLICY "Users upload own avatar" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id='avatars' AND auth.uid()::text = (storage.foldername(name))[1]);
CREATE POLICY "Users update own avatar" ON storage.objects FOR UPDATE TO authenticated USING (bucket_id='avatars' AND auth.uid()::text = (storage.foldername(name))[1]);