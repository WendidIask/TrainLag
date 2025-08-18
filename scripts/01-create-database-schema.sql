-- Create users table (extends Supabase auth.users)
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY,
  email TEXT NOT NULL,
  username TEXT UNIQUE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create games table
CREATE TABLE IF NOT EXISTS public.games (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  creator_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  status TEXT DEFAULT 'setup' CHECK (status IN ('setup', 'active', 'completed')),
  current_runner_id UUID REFERENCES public.profiles(id),
  player_order JSONB DEFAULT '[]',
  start_time TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create game_players table (many-to-many relationship)
CREATE TABLE IF NOT EXISTS public.game_players (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  game_id UUID REFERENCES public.games(id) ON DELETE CASCADE NOT NULL,
  player_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  role TEXT DEFAULT 'seeker' CHECK (role IN ('runner', 'seeker')),
  points INTEGER DEFAULT 0,
  joined_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(game_id, player_id)
);

-- Create card_sets table
CREATE TABLE IF NOT EXISTS public.card_sets (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  game_id UUID REFERENCES public.games(id) ON DELETE CASCADE NOT NULL,
  name TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('battle', 'roadblock', 'curse', 'utility')),
  cards JSONB NOT NULL DEFAULT '[]',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create maps table
CREATE TABLE IF NOT EXISTS public.maps (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  game_id UUID REFERENCES public.games(id) ON DELETE CASCADE NOT NULL,
  name TEXT NOT NULL,
  nodes JSONB NOT NULL DEFAULT '[]',
  edges JSONB NOT NULL DEFAULT '[]',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create game_state table for active game data
CREATE TABLE IF NOT EXISTS public.game_state (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  game_id UUID REFERENCES public.games(id) ON DELETE CASCADE NOT NULL UNIQUE,
  current_node TEXT,
  runner_points INTEGER DEFAULT 0,
  seeker_hands JSONB DEFAULT '{}',
  used_cards JSONB DEFAULT '[]',
  active_effects JSONB DEFAULT '[]',
  game_log JSONB DEFAULT '[]',
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enable Row Level Security
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.games ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.game_players ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.card_sets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.maps ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.game_state ENABLE ROW LEVEL SECURITY;

-- Create policies for profiles
CREATE POLICY "Users can view all profiles" ON public.profiles FOR SELECT USING (true);
CREATE POLICY "Users can update own profile" ON public.profiles FOR UPDATE USING (auth.uid() = id);
CREATE POLICY "Users can insert own profile" ON public.profiles FOR INSERT WITH CHECK (auth.uid() = id);

-- Create policies for games
CREATE POLICY "Users can view games they're part of" ON public.games FOR SELECT USING (
  creator_id = auth.uid() OR 
  id IN (SELECT game_id FROM public.game_players WHERE player_id = auth.uid())
);
CREATE POLICY "Users can create games" ON public.games FOR INSERT WITH CHECK (creator_id = auth.uid());
CREATE POLICY "Game creators can update their games" ON public.games FOR UPDATE USING (creator_id = auth.uid());

-- Create policies for game_players
CREATE POLICY "Users can view game players for their games" ON public.game_players FOR SELECT USING (
  game_id IN (
    SELECT id FROM public.games WHERE creator_id = auth.uid() OR 
    id IN (SELECT game_id FROM public.game_players WHERE player_id = auth.uid())
  )
);
CREATE POLICY "Game creators can manage players" ON public.game_players FOR ALL USING (
  game_id IN (SELECT id FROM public.games WHERE creator_id = auth.uid())
);
CREATE POLICY "Users can join games" ON public.game_players FOR INSERT WITH CHECK (player_id = auth.uid());

-- Create policies for card_sets
CREATE POLICY "Users can view card sets for their games" ON public.card_sets FOR SELECT USING (
  game_id IN (
    SELECT id FROM public.games WHERE creator_id = auth.uid() OR 
    id IN (SELECT game_id FROM public.game_players WHERE player_id = auth.uid())
  )
);
CREATE POLICY "Game creators can manage card sets" ON public.card_sets FOR ALL USING (
  game_id IN (SELECT id FROM public.games WHERE creator_id = auth.uid())
);

-- Create policies for maps
CREATE POLICY "Users can view maps for their games" ON public.maps FOR SELECT USING (
  game_id IN (
    SELECT id FROM public.games WHERE creator_id = auth.uid() OR 
    id IN (SELECT game_id FROM public.game_players WHERE player_id = auth.uid())
  )
);
CREATE POLICY "Game creators can manage maps" ON public.maps FOR ALL USING (
  game_id IN (SELECT id FROM public.games WHERE creator_id = auth.uid())
);

-- Create policies for game_state
CREATE POLICY "Users can view game state for their games" ON public.game_state FOR SELECT USING (
  game_id IN (
    SELECT id FROM public.games WHERE creator_id = auth.uid() OR 
    id IN (SELECT game_id FROM public.game_players WHERE player_id = auth.uid())
  )
);
CREATE POLICY "Game creators can manage game state" ON public.game_state FOR ALL USING (
  game_id IN (SELECT id FROM public.games WHERE creator_id = auth.uid())
);

-- Create function to handle user creation
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, email, username)
  VALUES (NEW.id, NEW.email, NEW.email);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create trigger for new user creation
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
